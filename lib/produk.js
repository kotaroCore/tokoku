// Produk dan satuan jual. Harga jual / harga satuan dan harga beli (modal) hanya boleh diubah admin
// atau staf yang punya izin. Menambah produk dan satuan baru boleh semua staf. Semua perubahan dicatat.

import { BadRequest } from '@/lib/sales';
import { wajibIzin } from '@/lib/izin';
import { catat, catatBeda } from '@/lib/catatan';

// Validasi & rapikan isi form produk.
export function parseProduk(b) {
  const category = String(b.category || '').trim().toUpperCase();
  const name = String(b.name || '').trim();
  if (!name || !category) throw new BadRequest('Kategori dan nama wajib diisi');
  const base_unit = String(b.base_unit || '').trim() || 'biji';
  const cost = Number(b.cost) || 0;
  if (cost < 0) throw new BadRequest('Harga beli tidak boleh negatif');

  const units = (b.units || [])
    .filter((u) => u.name?.trim() || String(u.price ?? '') !== '')
    .map((u) => ({
      id: u.id ? Number(u.id) : null,
      name: String(u.name || '').trim(),
      factor: Number(u.factor),
      price: Math.round(Number(u.price)),
    }));
  if (!units.length) throw new BadRequest('Minimal satu satuan jual');
  for (const u of units) {
    if (!u.name) throw new BadRequest('Nama satuan wajib diisi');
    if (!(u.factor > 0)) throw new BadRequest(`Faktor satuan "${u.name}" harus lebih dari 0`);
    if (!(u.price >= 0)) throw new BadRequest(`Harga satuan "${u.name}" tidak valid`);
  }
  const names = units.map((u) => u.name.toLowerCase());
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw new BadRequest(`Satuan "${dup}" muncul lebih dari sekali. Beri judul paket yang berbeda (mis. "setengah lusin") agar bisa dibedakan.`);

  return { category, name, base_unit, cost: Math.round(cost * 100) / 100, units };
}

const num0 = (x) => Math.max(0, Number(x) || 0);

export async function tambahProduk(q, session, b) {
  const data = parseProduk(b);
  const [dup] = await q('SELECT id FROM products WHERE category = ? AND name = ?', [data.category, data.name]);
  if (dup) throw new BadRequest(`Produk "${data.name}" di kategori ${data.category} sudah ada`);
  const variants = b.variants?.length ? b.variants : [{ color: '' }];
  const colors = variants.map((v) => String(v.color || '').trim().toLowerCase());
  if (new Set(colors).size !== colors.length) throw new BadRequest('Nama warna tidak boleh kembar');

  const p = await q('INSERT INTO products (category, name, base_unit, cost) VALUES (?, ?, ?, ?)', [
    data.category, data.name, data.base_unit, data.cost,
  ]);
  await catat(q, { userId: session.uid, objek: 'produk', objekId: p.insertId, aksi: 'tambah', baru: { category: data.category, name: data.name, base_unit: data.base_unit, cost: data.cost } });
  for (const u of data.units) {
    const r = await q('INSERT INTO units (product_id, name, factor, price) VALUES (?, ?, ?, ?)', [p.insertId, u.name, u.factor, u.price]);
    await catat(q, { userId: session.uid, objek: 'satuan', objekId: r.insertId, aksi: 'tambah', baru: { produk: data.name, name: u.name, factor: u.factor, price: u.price } });
  }
  for (const v of variants) {
    const r = await q(
      'INSERT INTO variants (product_id, color, stock, level_green, level_yellow, level_red) VALUES (?, ?, ?, ?, ?, ?)',
      [p.insertId, String(v.color || '').trim(), num0(v.stock), num0(v.level_green), num0(v.level_yellow), num0(v.level_red)]
    );
    await catat(q, { userId: session.uid, objek: 'warna', objekId: r.insertId, aksi: 'tambah', baru: { produk: data.name, color: String(v.color || '').trim(), stock: num0(v.stock) } });
  }
  return p.insertId;
}

// Ubah data produk + satuan jual. Satuan dicocokkan lewat id: ada id = diubah,
// tanpa id = ditambah, tidak dikirim = dihapus. Nota lama aman karena menyimpan salinan nama/harga.
export async function ubahProduk(q, session, b) {
  const [cur] = await q('SELECT * FROM products WHERE id = ? FOR UPDATE', [b.id]);
  if (!cur) throw new BadRequest('Produk tidak ditemukan');
  const data = parseProduk(b);
  const [dup] = await q('SELECT id FROM products WHERE category = ? AND name = ? AND id <> ?', [data.category, data.name, cur.id]);
  if (dup) throw new BadRequest(`Produk "${data.name}" di kategori ${data.category} sudah ada`);

  const old = await q('SELECT * FROM units WHERE product_id = ?', [cur.id]);
  const keep = new Set(data.units.filter((u) => u.id).map((u) => u.id));
  const dihapus = old.filter((o) => !keep.has(o.id));
  const diubah = data.units.filter((u) => u.id && old.some((o) => o.id === u.id));
  const hargaBerubah = diubah.some((u) => {
    const o = old.find((x) => x.id === u.id);
    return Number(o.price) !== u.price || Number(o.factor) !== u.factor;
  });
  // Menghapus satuan lalu menambah yang baru sama saja dengan mengubah harga, jadi ikut butuh izin.
  if (hargaBerubah || dihapus.length) wajibIzin(session, 'ubah_harga');
  if (Math.abs(Number(cur.cost) - data.cost) > 0.001) wajibIzin(session, 'ubah_modal');

  await q('UPDATE products SET category = ?, name = ?, base_unit = ?, cost = ? WHERE id = ?', [
    data.category, data.name, data.base_unit, data.cost, cur.id,
  ]);
  await catatBeda(q, { userId: session.uid, objek: 'produk', objekId: cur.id, lama: cur, baru: data, keys: ['category', 'name', 'base_unit', 'cost'] });
  for (const o of dihapus) {
    await q('DELETE FROM units WHERE id = ?', [o.id]);
    await catat(q, { userId: session.uid, objek: 'satuan', objekId: o.id, aksi: 'hapus', lama: { produk: cur.name, name: o.name, factor: o.factor, price: o.price } });
  }
  for (const u of data.units) {
    const o = u.id && old.find((x) => x.id === u.id);
    if (o) {
      await q('UPDATE units SET name = ?, factor = ?, price = ? WHERE id = ? AND product_id = ?', [u.name, u.factor, u.price, u.id, cur.id]);
      await catatBeda(q, { userId: session.uid, objek: 'satuan', objekId: u.id, lama: o, baru: u, keys: ['name', 'factor', 'price'] });
    } else {
      const r = await q('INSERT INTO units (product_id, name, factor, price) VALUES (?, ?, ?, ?)', [cur.id, u.name, u.factor, u.price]);
      await catat(q, { userId: session.uid, objek: 'satuan', objekId: r.insertId, aksi: 'tambah', baru: { produk: data.name, name: u.name, factor: u.factor, price: u.price } });
    }
  }
}

// Aktifkan / nonaktifkan produk (tidak dihapus agar riwayat nota tetap utuh).
export async function aktifProduk(q, session, id, active) {
  const [p] = await q('SELECT * FROM products WHERE id = ? FOR UPDATE', [id]);
  if (!p) throw new BadRequest('Produk tidak ditemukan');
  await q('UPDATE products SET active = ? WHERE id = ?', [active ? 1 : 0, p.id]);
  if (!!p.active !== !!active) await catat(q, { userId: session.uid, objek: 'produk', objekId: p.id, aksi: active ? 'aktif' : 'nonaktif', lama: { active: p.active }, baru: { active: active ? 1 : 0 } });
}
