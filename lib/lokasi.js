// Tempat penyimpanan tiap warna (maks. 3), masing-masing dengan stoknya.
// Tempat dipilih dari daftar lokasi yang dibuat admin (tabel lokasi), jadi namanya seragam dan tidak diketik ulang.
// Stok warna tetap satu angka (variants.stock); stok per tempat hanya rincian untuk mencari barang,
// dan jumlahnya selalu disamakan dengan stok warna:
// - stok bertambah (retur, koreksi, cek sore) masuk ke tempat 1; masuk rak wajib memilih tempatnya;
// - stok berkurang (penjualan, koreksi) diambil dari tempat 1 dulu, lalu tempat 2, lalu tempat 3.
// variants.lokasi_rak selalu berisi nama tempat 1 (untuk pencarian).

import { BadRequest } from '@/lib/sales';
import { catatBeda } from '@/lib/catatan';

export const MAKS_TEMPAT = 3;
const EPS = 1e-9;

export const labelLokasi = (l) => [l.ruangan, l.lemari, l.rak].filter(Boolean).join(' / ');

async function lokasiAktif(q, id, bolehNonaktif = []) {
  const [l] = await q('SELECT * FROM lokasi WHERE id = ?', [id]);
  if (!l) throw new BadRequest('Tempat tidak ada di daftar lokasi');
  if (!l.aktif && !bolehNonaktif.includes(l.id)) throw new BadRequest(`Tempat ${labelLokasi(l)} sudah dinonaktifkan`);
  return l;
}

async function simpanNamaTempat1(q, variantId) {
  const [t] = await q(
    'SELECT l.* FROM variant_lokasi vl JOIN lokasi l ON l.id = vl.lokasi_id WHERE vl.variant_id = ? ORDER BY vl.urutan LIMIT 1',
    [variantId]
  );
  await q('UPDATE variants SET lokasi_rak = ? WHERE id = ?', [t ? labelLokasi(t) : null, variantId]);
}

// Samakan jumlah stok per tempat dengan stok warna. Dipanggil setelah stok warna berubah.
export async function rapikanLokasi(q, variantId) {
  const rows = await q('SELECT * FROM variant_lokasi WHERE variant_id = ? ORDER BY urutan FOR UPDATE', [variantId]);
  if (!rows.length) return;
  const [v] = await q('SELECT stock FROM variants WHERE id = ?', [variantId]);
  let selisih = v.stock - rows.reduce((t, r) => t + r.qty, 0);
  if (Math.abs(selisih) < EPS) return;
  const baru = rows.map((r) => ({ ...r }));
  if (selisih > 0) {
    baru[0].qty += selisih;
  } else {
    for (const r of baru) {
      const ambil = Math.min(r.qty, -selisih);
      r.qty -= ambil;
      selisih += ambil;
      if (selisih > -EPS) break;
    }
  }
  for (const [i, r] of baru.entries()) {
    if (Math.abs(r.qty - rows[i].qty) > EPS) await q('UPDATE variant_lokasi SET qty = ? WHERE id = ?', [Math.max(0, Math.round(r.qty * 1e6) / 1e6), r.id]);
  }
}

// Barang masuk rak: tempat wajib dipilih dari daftar lokasi. Bila warna belum disimpan di tempat itu,
// tempat itu ditambahkan ke warna ini (maks. 3). Panggil setelah stok warna ditambah.
export async function masukKeTempat(q, variantId, lokasiId, qty) {
  if (!lokasiId) throw new BadRequest('Pilih tempat untuk setiap warna yang masuk rak');
  const l = await lokasiAktif(q, lokasiId);
  const rows = await q('SELECT * FROM variant_lokasi WHERE variant_id = ? ORDER BY urutan FOR UPDATE', [variantId]);
  const ada = rows.find((r) => r.lokasi_id === l.id);
  if (ada) {
    await q('UPDATE variant_lokasi SET qty = qty + ? WHERE id = ?', [qty, ada.id]);
  } else {
    if (rows.length >= MAKS_TEMPAT) throw new BadRequest(`Warna ini sudah punya ${MAKS_TEMPAT} tempat. Pilih salah satunya, atau atur tempat di halaman Stok.`);
    // Tempat baru untuk warna ini. Bila warna belum punya tempat sama sekali, seluruh stoknya dianggap di sini
    // (dirapikan di bawah); bila sudah, hanya barang yang baru masuk.
    await q('INSERT INTO variant_lokasi (variant_id, urutan, lokasi_id, lokasi, qty) VALUES (?, ?, ?, ?, ?)', [
      variantId, rows.length + 1, l.id, labelLokasi(l), rows.length ? qty : 0,
    ]);
    if (!rows.length) await simpanNamaTempat1(q, variantId);
  }
  await rapikanLokasi(q, variantId);
}

// Ganti daftar tempat satu warna. tempat: [{ lokasi_id, qty }] urut tempat 1, 2, 3.
// Stok tempat 1 dihitung dari stok warna dikurangi tempat lain, jadi totalnya tetap sama (ini bukan koreksi stok).
// qtyPenuh = true: semua qty dipakai apa adanya dan jumlahnya harus sama dengan stok warna (dipakai opname).
export async function aturLokasi(q, { variantId, userId, tempat, qtyPenuh = false }) {
  const list = (tempat || []).filter((t) => t.lokasi_id).map((t) => ({ lokasi_id: Number(t.lokasi_id), qty: Number(t.qty) || 0 }));
  if (list.length > MAKS_TEMPAT) throw new BadRequest(`Maksimal ${MAKS_TEMPAT} tempat per warna`);
  if (new Set(list.map((t) => t.lokasi_id)).size !== list.length) throw new BadRequest('Tempat yang sama dipilih dua kali');
  if (list.some((t) => t.qty < 0)) throw new BadRequest('Stok tempat tidak boleh negatif');

  const [v] = await q('SELECT * FROM variants WHERE id = ? FOR UPDATE', [variantId]);
  if (!v) throw new BadRequest('Warna tidak ditemukan');
  const lama = await q(
    'SELECT l.ruangan, l.lemari, l.rak, vl.lokasi_id, vl.qty FROM variant_lokasi vl LEFT JOIN lokasi l ON l.id = vl.lokasi_id WHERE vl.variant_id = ? ORDER BY vl.urutan',
    [v.id]
  );
  // Tempat yang sudah dipakai warna ini tetap boleh walau lokasinya sudah dinonaktifkan.
  const sudah = lama.map((x) => x.lokasi_id);
  for (const t of list) t.l = await lokasiAktif(q, t.lokasi_id, sudah);
  if (list.length && !qtyPenuh) {
    const lain = list.slice(1).reduce((t, x) => t + x.qty, 0);
    if (lain > v.stock + EPS) throw new BadRequest(`Stok tempat 2 dan 3 (${lain}) melebihi stok warna (${v.stock})`);
    list[0].qty = v.stock - lain;
  }
  if (qtyPenuh && list.length && Math.abs(list.reduce((t, x) => t + x.qty, 0) - v.stock) > 1e-6) {
    throw new BadRequest('Jumlah stok per tempat harus sama dengan stok warna');
  }

  await q('DELETE FROM variant_lokasi WHERE variant_id = ?', [v.id]);
  for (const [i, t] of list.entries()) {
    await q('INSERT INTO variant_lokasi (variant_id, urutan, lokasi_id, lokasi, qty) VALUES (?, ?, ?, ?, ?)', [
      v.id, i + 1, t.lokasi_id, labelLokasi(t.l), Math.round(t.qty * 1e6) / 1e6,
    ]);
  }
  await simpanNamaTempat1(q, v.id);
  const teks = (xs) => xs.map((x) => `${labelLokasi(x.l || x)}: ${Math.round(x.qty * 100) / 100}`).join('; ') || '-';
  await catatBeda(q, { userId, objek: 'warna', objekId: v.id, lama: { tempat: teks(lama) }, baru: { tempat: teks(list) } });
}

// Tempat per warna untuk banyak warna sekaligus: { variant_id: [{ urutan, lokasi_id, lokasi, qty }] }.
export async function tempatWarna(q, variantIds) {
  if (!variantIds.length) return {};
  const rows = await q(
    `SELECT vl.variant_id, vl.urutan, vl.lokasi_id, vl.qty, l.ruangan, l.lemari, l.rak, vl.lokasi AS nama_lama
     FROM variant_lokasi vl LEFT JOIN lokasi l ON l.id = vl.lokasi_id WHERE vl.variant_id IN (?) ORDER BY vl.variant_id, vl.urutan`,
    [variantIds]
  );
  const out = {};
  for (const r of rows) {
    (out[r.variant_id] ||= []).push({ urutan: r.urutan, lokasi_id: r.lokasi_id, lokasi: r.ruangan ? labelLokasi(r) : r.nama_lama, qty: r.qty });
  }
  return out;
}

// Ganti nama lokasi di daftar: semua warna yang memakainya ikut nama baru.
export async function gantiNamaLokasi(q, { id, ruangan, lemari, rak, userId }) {
  const [l] = await q('SELECT * FROM lokasi WHERE id = ? FOR UPDATE', [id]);
  if (!l) throw new BadRequest('Lokasi tidak ditemukan');
  const baru = { ruangan: String(ruangan || '').trim(), lemari: String(lemari || '').trim(), rak: String(rak || '').trim() };
  if (!baru.ruangan) throw new BadRequest('Ruangan wajib diisi');
  if (labelLokasi(baru).length > 50) throw new BadRequest('Nama lokasi terlalu panjang (maks. 50 huruf)');
  const [dup] = await q('SELECT id FROM lokasi WHERE ruangan = ? AND lemari = ? AND rak = ? AND id <> ?', [baru.ruangan, baru.lemari, baru.rak, l.id]);
  if (dup) throw new BadRequest(`Lokasi ${labelLokasi(baru)} sudah ada`);
  await q('UPDATE lokasi SET ruangan = ?, lemari = ?, rak = ? WHERE id = ?', [baru.ruangan, baru.lemari, baru.rak, l.id]);
  await q('UPDATE variant_lokasi SET lokasi = ? WHERE lokasi_id = ?', [labelLokasi(baru), l.id]);
  await q('UPDATE variants v JOIN variant_lokasi vl ON vl.variant_id = v.id AND vl.urutan = 1 AND vl.lokasi_id = ? SET v.lokasi_rak = ?', [l.id, labelLokasi(baru)]);
  await catatBeda(q, { userId, objek: 'pengaturan', objekId: l.id, lama: { lokasi: labelLokasi(l) }, baru: { lokasi: labelLokasi(baru) } });
}
