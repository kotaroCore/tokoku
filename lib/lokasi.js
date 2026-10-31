// Tempat penyimpanan tiap warna (maks. 3), masing-masing dengan stoknya.
// Stok warna tetap satu angka (variants.stock); stok per tempat hanya rincian untuk mencari barang,
// dan jumlahnya selalu disamakan dengan stok warna:
// - stok bertambah (retur, koreksi, cek sore) masuk ke tempat 1, kecuali masuk rak yang memilih tempatnya;
// - stok berkurang (penjualan, koreksi) diambil dari tempat 1 dulu, lalu tempat 2, lalu tempat 3.
// variants.lokasi_rak selalu berisi nama tempat 1 (untuk pencarian).

import { BadRequest } from '@/lib/sales';
import { catatBeda } from '@/lib/catatan';

export const MAKS_TEMPAT = 3;
const EPS = 1e-9;

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

// Barang masuk rak ke tempat tertentu (urutan 1–3). Panggil setelah stok warna ditambah.
export async function masukKeTempat(q, variantId, urutan, qty) {
  if (urutan) {
    await q('UPDATE variant_lokasi SET qty = qty + ? WHERE variant_id = ? AND urutan = ?', [qty, variantId, urutan]);
  }
  await rapikanLokasi(q, variantId);
}

// Ganti daftar tempat satu warna. tempat: [{ lokasi, qty }] urut tempat 1, 2, 3.
// Stok tempat 1 dihitung dari stok warna dikurangi tempat lain, jadi totalnya tetap sama (ini bukan koreksi stok).
// opsi.qtyPenuh = true: semua qty dipakai apa adanya dan jumlahnya harus sama dengan stok warna (dipakai opname).
export async function aturLokasi(q, { variantId, userId, tempat, qtyPenuh = false }) {
  const list = (tempat || [])
    .map((t) => ({ lokasi: String(t.lokasi || '').trim().replace(/\s+/g, ' '), qty: Number(t.qty) || 0 }))
    .filter((t) => t.lokasi);
  if (list.length > MAKS_TEMPAT) throw new BadRequest(`Maksimal ${MAKS_TEMPAT} tempat per warna`);
  if (list.some((t) => t.lokasi.length > 50)) throw new BadRequest('Nama tempat maksimal 50 huruf');
  const nama = list.map((t) => t.lokasi.toLowerCase());
  if (new Set(nama).size !== nama.length) throw new BadRequest('Nama tempat tidak boleh kembar');
  if (list.some((t) => t.qty < 0)) throw new BadRequest('Stok tempat tidak boleh negatif');

  const [v] = await q('SELECT * FROM variants WHERE id = ? FOR UPDATE', [variantId]);
  if (!v) throw new BadRequest('Warna tidak ditemukan');
  const lama = await q('SELECT lokasi, qty FROM variant_lokasi WHERE variant_id = ? ORDER BY urutan', [v.id]);
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
    await q('INSERT INTO variant_lokasi (variant_id, urutan, lokasi, qty) VALUES (?, ?, ?, ?)', [v.id, i + 1, t.lokasi, Math.round(t.qty * 1e6) / 1e6]);
  }
  const lokasi_rak = list[0]?.lokasi || null;
  await q('UPDATE variants SET lokasi_rak = ? WHERE id = ?', [lokasi_rak, v.id]);
  const teks = (xs) => xs.map((x) => `${x.lokasi}: ${Math.round(x.qty * 100) / 100}`).join('; ') || '-';
  await catatBeda(q, { userId, objek: 'warna', objekId: v.id, lama: { tempat: teks(lama) }, baru: { tempat: teks(list) } });
}

// Tempat per warna untuk banyak warna sekaligus: { variant_id: [{ urutan, lokasi, qty }] }.
export async function tempatWarna(q, variantIds) {
  if (!variantIds.length) return {};
  const rows = await q('SELECT variant_id, urutan, lokasi, qty FROM variant_lokasi WHERE variant_id IN (?) ORDER BY variant_id, urutan', [variantIds]);
  const out = {};
  for (const r of rows) (out[r.variant_id] ||= []).push({ urutan: r.urutan, lokasi: r.lokasi, qty: r.qty });
  return out;
}
