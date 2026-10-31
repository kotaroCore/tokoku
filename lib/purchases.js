// Logika barang masuk (pembelian dari supplier).
// - Status: dalam perjalanan (stok belum bertambah), diterima, atau hilang.
// - Saat diterima: harga beli terakhir produk diperbarui. Bila berbeda dari sebelumnya, dibuat peringatan harga.
// - Stok bertambah hanya saat barang dimasukkan rak per warna (masukRak).

import { BadRequest } from '@/lib/sales';
import { catatDompet } from '@/lib/dompet';

const SELISIH_MINIMAL = 0.5; // rupiah per satuan dasar; selisih lebih kecil dianggap sama
const METHODS = ['cash', 'ewallet', 'transfer'];
const EPS = 1e-6;

// Terima barang: perbarui harga beli terakhir dan catat peringatan bila berubah.
// Dipanggil saat status pembelian menjadi diterima (baik saat dicatat maupun setelah dikirim).
export async function terimaBarang(q, purchaseId, userId, isOwner) {
  const items = await q('SELECT * FROM purchase_items WHERE purchase_id = ? AND product_id IS NOT NULL', [purchaseId]);
  for (const it of items) {
    const baru = Math.round((Number(it.unit_cost) / Number(it.factor)) * 100) / 100;
    const [p] = await q('SELECT * FROM products WHERE id = ? FOR UPDATE', [it.product_id]);
    if (!p) continue;
    const lama = Number(p.cost) || 0;
    if (lama > 0 && Math.abs(baru - lama) >= SELISIH_MINIMAL) {
      await q(
        'INSERT INTO harga_alert (product_id, purchase_id, lama, baru, dibuat_oleh) VALUES (?, ?, ?, ?, ?)',
        [p.id, purchaseId, lama, baru, userId]
      );
      // Peringatan dari staf disimpan sampai owner login: owner dapat pop-up lewat notice.
      if (!isOwner) {
        await q('INSERT INTO notices (kind, message) VALUES (?, ?)', [
          'info', `Harga beli ${p.name} berubah dari Rp ${Math.round(lama)} ke Rp ${Math.round(baru)} per ${p.base_unit}. Cek di Barang masuk.`,
        ]);
      }
    }
    await q('UPDATE products SET cost = ? WHERE id = ?', [baru, p.id]);
  }
}

// Catat nota dari supplier (per produk, tanpa warna). Pembelian dianggap langsung lunas.
// Status awal: diterima (default) atau dalam perjalanan. Saat diterima, harga beli terakhir produk diperbarui.
export async function catatPembelian(q, { userId, shiftId, isOwner }, b) {
  const lines = b.items || [];
  if (!lines.length) throw new BadRequest('Belum ada barang');
  const method = METHODS.includes(b.pay_method) ? b.pay_method : 'cash';
  const status = b.status === 'dalam_perjalanan' ? 'dalam_perjalanan' : 'diterima';

  let supplierId = null;
  if (b.supplier_id) {
    const [s] = await q('SELECT * FROM suppliers WHERE id = ?', [b.supplier_id]);
    if (!s || !s.active) throw new BadRequest('Supplier tidak ditemukan atau nonaktif');
    supplierId = s.id;
  }

  let total = 0;
  const done = [];
  for (const l of lines) {
    const [p] = await q('SELECT * FROM products WHERE id = ?', [l.product_id]);
    // Satuan kulakan bebas (gross, dosin, ...): nama + faktor (isi dalam satuan dasar) dikirim dari layar.
    const u = { name: String(l.unit_name || '').trim(), factor: Number(l.factor) };
    const qty = Number(l.qty);
    const cost = Number(l.unit_cost);
    if (!p || !u.name || u.name.length > 50 || !(u.factor > 0) || !(qty > 0) || !(cost >= 0)) throw new BadRequest('Barang, jumlah, atau harga beli tidak valid');
    if (!p.active) throw new BadRequest(`Produk ${p.name} sudah dinonaktifkan`);
    const subtotal = Math.round(qty * cost);
    total += subtotal;
    done.push({ p, u, qty, cost, subtotal });
  }

  const r = await q(
    'INSERT INTO purchases (supplier_id, user_id, shift_id, total, pay_method, note, status, nomor_nota_supplier, cara_kirim) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [supplierId, userId, shiftId ?? null, total, method, String(b.note || '').trim() || null, status,
      String(b.nomor_nota_supplier || '').trim() || null, String(b.cara_kirim || '').trim() || null]
  );
  for (const d of done) {
    await q(
      `INSERT INTO purchase_items (purchase_id, product_id, variant_id, product_name, color, unit_name, qty, factor, unit_cost, subtotal)
       VALUES (?, ?, NULL, ?, '', ?, ?, ?, ?, ?)`,
      [r.insertId, d.p.id, d.p.name, d.u.name, d.qty, d.u.factor, Math.round(d.cost), d.subtotal]
    );
  }
  // Pembelian tunai dibayar dari dompet kulakan.
  if (method === 'cash') {
    await catatDompet(q, { dompet: 'kulakan', jumlah: -total, jenis: 'pembelian', keterangan: `Pembelian #${r.insertId}`, userId, purchaseId: r.insertId });
  }
  if (status === 'diterima') await terimaBarang(q, r.insertId, userId, isOwner);
  return { id: r.insertId, total, status };
}

// Ubah status kiriman: dalam perjalanan -> diterima (harga beli diperbarui) atau hilang.
// Barang yang sudah diterima tidak bisa ditandai hilang; koreksinya lewat stok.
export async function ubahStatusPembelian(q, id, status, { userId, isOwner }) {
  const [pu] = await q('SELECT * FROM purchases WHERE id = ? FOR UPDATE', [id]);
  if (!pu) throw new BadRequest('Pembelian tidak ditemukan');
  if (pu.status !== 'dalam_perjalanan') throw new BadRequest(`Status sudah ${pu.status}`);
  if (status === 'diterima') {
    await q("UPDATE purchases SET status = 'diterima' WHERE id = ?", [id]);
    await terimaBarang(q, id, userId, isOwner);
  } else if (status === 'hilang') {
    await q("UPDATE purchases SET status = 'hilang' WHERE id = ?", [id]);
  } else {
    throw new BadRequest('Status tidak dikenal');
  }
}

// Masukkan barang dari nota pembelian ke rak, dibagi per warna. Stok tiap warna bertambah.
// lines: [{ variant_id, qty, factor? }]. qty dalam satuan baris itu; factor = isi satuan tsb
// dalam satuan dasar (kosong = satuan yang tertulis di nota), jadi tiap warna boleh memakai satuan berbeda.
// Boleh dicicil, tetapi total yang dirak tidak boleh melebihi jumlah di nota.
export async function masukRak(q, purchaseId, itemId, rawLines, userId) {
  const lines = (rawLines || []).filter((l) => Number(l.qty) !== 0);
  if (!lines.length) throw new BadRequest('Isi jumlah minimal satu warna');
  const [item] = await q('SELECT * FROM purchase_items WHERE id = ? AND purchase_id = ? FOR UPDATE', [itemId, purchaseId]);
  if (!item) throw new BadRequest('Barang di nota tidak ditemukan');
  const [pembelian] = await q('SELECT status FROM purchases WHERE id = ?', [purchaseId]);
  if (pembelian.status !== 'diterima') throw new BadRequest('Barang belum diterima. Tandai diterima dulu sebelum masuk rak.');
  if (!item.product_id) throw new BadRequest('Barang ini sudah punya warna dari catatan lama');

  let add = 0;
  const seen = new Set();
  const done = [];
  for (const l of lines) {
    const qty = Number(l.qty);
    if (!(qty > 0)) throw new BadRequest('Jumlah per warna harus lebih dari 0');
    if (seen.has(l.variant_id)) throw new BadRequest('Warna yang sama terisi dua kali');
    seen.add(l.variant_id);
    const [v] = await q('SELECT * FROM variants WHERE id = ? AND product_id = ? FOR UPDATE', [l.variant_id, item.product_id]);
    if (!v) throw new BadRequest('Warna tidak termasuk produk ini');
    if (!v.active) throw new BadRequest(`Warna ${v.color} sudah dinonaktifkan`);
    const f = l.factor == null ? item.factor : Number(l.factor);
    if (!(f > 0)) throw new BadRequest('Faktor satuan tidak valid');
    const base = qty * f;
    add += base;
    done.push({ v, base });
  }
  const total = item.qty * item.factor;
  if (item.shelved + add > total + EPS) {
    throw new BadRequest(`Melebihi nota. Sisa yang belum dirak ${(total - item.shelved) / item.factor} ${item.unit_name}`);
  }

  for (const d of done) {
    await q('UPDATE variants SET stock = stock + ? WHERE id = ?', [d.base, d.v.id]);
    await q('INSERT INTO stock_adjustments (variant_id, user_id, delta, note) VALUES (?, ?, ?, ?)', [
      d.v.id, userId, d.base, `Masuk rak pembelian #${purchaseId}`,
    ]);
    await q('INSERT INTO purchase_shelf (purchase_item_id, variant_id, user_id, qty) VALUES (?, ?, ?, ?)', [
      item.id, d.v.id, userId, d.base,
    ]);
  }
  await q('UPDATE purchase_items SET shelved = shelved + ? WHERE id = ?', [add, item.id]);
  return { shelved: item.shelved + add, total };
}
