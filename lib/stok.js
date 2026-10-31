// Perubahan stok di luar penjualan, retur, dan barang masuk: koreksi manual dan cek sore.
// Semua perubahan dicatat di stock_adjustments. Stok jual dan stok rusak tidak boleh minus.

import { BadRequest } from '@/lib/sales';
import { catat } from '@/lib/catatan';
import { rapikanLokasi, aturLokasi } from '@/lib/lokasi';

const EPS = 1e-9;

// Koreksi stok (delta dalam satuan dasar). Alasan wajib. kolom: 'jual' (stock) atau 'rusak' (stok_rusak).
// Koreksi manual juga masuk catatan perubahan (catatPerubahan = false untuk jalur yang punya jejak sendiri).
// jenis: 'koreksi' (bawaan), 'stok_awal', atau 'opname'.
export async function koreksiStok(q, { variantId, userId, delta, note, kolom = 'jual', jenis = 'koreksi', catatPerubahan = true }) {
  const alasan = String(note || '').trim();
  if (!alasan) throw new BadRequest('Alasan koreksi stok wajib diisi');
  if (!Number.isFinite(delta) || !delta) throw new BadRequest('Jumlah koreksi tidak valid');
  const field = kolom === 'rusak' ? 'stok_rusak' : 'stock';
  const [v] = await q(`SELECT id, ${field} AS sisa FROM variants WHERE id = ? FOR UPDATE`, [variantId]);
  if (!v) throw new BadRequest('Varian tidak ditemukan');
  if (v.sisa + delta < -EPS) throw new BadRequest(`Stok${kolom === 'rusak' ? ' rusak' : ''} tidak boleh minus (sisa ${v.sisa})`);
  await q(`UPDATE variants SET ${field} = GREATEST(0, ${field} + ?) WHERE id = ?`, [delta, v.id]);
  if (kolom !== 'rusak') await rapikanLokasi(q, v.id);
  await q('INSERT INTO stock_adjustments (variant_id, user_id, delta, note, kolom, jenis) VALUES (?, ?, ?, ?, ?, ?)', [
    v.id, userId, delta, alasan.slice(0, 255), kolom === 'rusak' ? 'rusak' : 'jual', jenis,
  ]);
  const sesudah = Math.max(0, v.sisa + delta);
  if (catatPerubahan) {
    await catat(q, { userId, objek: 'stok', objekId: v.id, aksi: 'ubah', lama: { [field]: v.sisa }, baru: { [field]: sesudah, alasan: alasan.slice(0, 255) } });
  }
  return { sebelum: v.sisa, sesudah };
}

// Cek sore: stok yang diambil otomatis dikembalikan dulu, lalu dipotong dari warna sebenarnya (allocations).
export async function cekSoreAlokasi(q, { productId, userId, allocations }) {
  const alloc = (allocations || []).map((a) => ({ variant_id: Number(a.variant_id), qty: Number(a.qty) })).filter((a) => a.qty > 0);
  const items = await q(
    `SELECT i.* FROM sale_items i JOIN sales s ON s.id = i.sale_id AND s.status = 'lunas'
     JOIN variants v ON v.id = i.variant_id
     WHERE i.auto_pick = 1 AND i.auto_resolved = 0 AND v.product_id = ? FOR UPDATE`,
    [productId]
  );
  if (!items.length) throw new BadRequest('Tidak ada barang yang perlu dicek untuk produk ini');
  const total = items.reduce((s, i) => s + i.qty * i.factor, 0);
  const sum = alloc.reduce((s, a) => s + a.qty, 0);
  if (Math.abs(sum - total) > 1e-6) throw new BadRequest(`Jumlah per warna (${sum}) harus sama dengan total terjual (${total})`);
  for (const i of items) {
    await q('UPDATE variants SET stock = stock + ? WHERE id = ?', [i.qty * i.factor, i.variant_id]);
    await q('INSERT INTO stock_adjustments (variant_id, user_id, delta, note, jenis) VALUES (?, ?, ?, ?, ?)', [
      i.variant_id, userId, i.qty * i.factor, `Cek sore: kembalikan stok otomatis nota #${i.sale_id}`, 'cek_sore',
    ]);
  }
  for (const a of alloc) {
    const [v] = await q('SELECT * FROM variants WHERE id = ? AND product_id = ? FOR UPDATE', [a.variant_id, productId]);
    if (!v || !v.active) throw new BadRequest('Warna tidak valid');
    if (v.stock < a.qty - EPS) throw new BadRequest(`Stok ${v.color || 'tanpa warna'} tidak cukup (sisa ${v.stock})`);
    await q('UPDATE variants SET stock = stock - ? WHERE id = ?', [a.qty, v.id]);
    await q('INSERT INTO stock_adjustments (variant_id, user_id, delta, note, jenis) VALUES (?, ?, ?, ?, ?)', [
      v.id, userId, -a.qty, 'Cek sore: warna sebenarnya terjual', 'cek_sore',
    ]);
  }
  await q('UPDATE sale_items SET auto_resolved = 1 WHERE id IN (?)', [items.map((i) => i.id)]);
  // Stok per tempat dirapikan sekali dari perubahan bersihnya.
  for (const id of new Set([...items.map((i) => i.variant_id), ...alloc.map((a) => a.variant_id)])) await rapikanLokasi(q, id);
}

// Stok awal (hitungan fisik) satu warna: stok diganti dengan jumlah yang dihitung (satuan dasar).
// Selisihnya dicatat sebagai koreksi "stok awal"; warna diberi tanda tanggal dihitung.
export async function isiStokAwal(q, { variantId, userId, jumlah }) {
  if (!Number.isFinite(jumlah) || jumlah < 0) throw new BadRequest('Jumlah tidak valid');
  const [v] = await q('SELECT id, stock FROM variants WHERE id = ? FOR UPDATE', [variantId]);
  if (!v) throw new BadRequest('Warna tidak ditemukan');
  const delta = Math.round((jumlah - v.stock) * 1e6) / 1e6;
  if (delta) await koreksiStok(q, { variantId: v.id, userId, delta, note: 'stok awal', jenis: 'stok_awal' });
  await q('UPDATE variants SET stok_awal_pada = NOW() WHERE id = ?', [v.id]);
  const [{ stok_awal_pada }] = await q('SELECT stok_awal_pada FROM variants WHERE id = ?', [v.id]);
  return { sebelum: v.stock, sesudah: jumlah, stok_awal_pada };
}

// Stok opname satu warna: jumlah fisik di setiap lokasi dijumlahkan, selisih terhadap stok sistem
// disimpan sebagai koreksi (jenis opname, alasan wajib bila ada selisih). Hasilnya tercatat per tanggal dan penghitung.
// items: [{ lokasi, qty }] dalam satuan dasar.
export async function simpanOpname(q, { variantId, userId, items, alasan }) {
  const baris = (items || []).map((i) => ({ lokasi: String(i.lokasi || '').trim().slice(0, 50), qty: Number(i.qty) })).filter((i) => i.lokasi || i.qty);
  if (!baris.length) throw new BadRequest('Isi jumlah fisik minimal satu lokasi');
  if (baris.some((i) => !Number.isFinite(i.qty) || i.qty < 0)) throw new BadRequest('Jumlah fisik tidak boleh negatif');
  const [v] = await q('SELECT id, stock FROM variants WHERE id = ? FOR UPDATE', [variantId]);
  if (!v) throw new BadRequest('Warna tidak ditemukan');
  const fisik = Math.round(baris.reduce((t, i) => t + i.qty, 0) * 1e6) / 1e6;
  const selisih = Math.round((fisik - v.stock) * 1e6) / 1e6;
  const why = String(alasan || '').trim();
  if (selisih && !why) throw new BadRequest('Ada selisih: alasan wajib diisi');
  const r = await q('INSERT INTO opname (variant_id, user_id, stok_sistem, jumlah_fisik, selisih, alasan) VALUES (?, ?, ?, ?, ?, ?)', [
    v.id, userId, v.stock, fisik, selisih, why || null,
  ]);
  for (const i of baris) await q('INSERT INTO opname_item (opname_id, lokasi, qty) VALUES (?, ?, ?)', [r.insertId, i.lokasi, i.qty]);
  if (selisih) await koreksiStok(q, { variantId: v.id, userId, delta: selisih, note: `Opname #${r.insertId}: ${why}`, jenis: 'opname' });
  // Tempat yang diberi nama menjadi tempat penyimpanan warna ini, dengan stok hasil hitungan.
  if (baris.some((i) => i.lokasi)) {
    if (baris.some((i) => !i.lokasi)) throw new BadRequest('Isi nama tempat di setiap baris');
    await aturLokasi(q, { variantId: v.id, userId, tempat: baris, qtyPenuh: true });
  }
  return { id: r.insertId, stok_sistem: v.stock, jumlah_fisik: fisik, selisih };
}
