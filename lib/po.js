// Pesanan (PO) ke supplier: draft -> dikirim -> diterima sebagian / diterima, atau batal.
// PO tidak menyentuh stok. Barang yang datang dicatat lewat barang masuk biasa dengan rujukan po_id;
// saat barang masuk diterima, jumlah diterima di PO bertambah (lihat terimaBarang di lib/purchases.js).
// Pembelian tetap lunas; tidak ada hutang supplier.

import { BadRequest } from '@/lib/sales';

export const STATUS_PO = ['draft', 'dikirim', 'diterima_sebagian', 'diterima', 'batal'];
const EPS = 1e-6;

export async function buatPO(q, session, b) {
  const [s] = await q('SELECT * FROM suppliers WHERE id = ?', [b.supplier_id]);
  if (!s || !s.active) throw new BadRequest('Pilih supplier yang aktif');
  const items = (b.items || []).filter((i) => Number(i.qty) > 0);
  if (!items.length) throw new BadRequest('Isi minimal satu barang');
  const r = await q('INSERT INTO purchase_orders (supplier_id, user_id, catatan) VALUES (?, ?, ?)', [
    s.id, session.uid, String(b.catatan || '').trim() || null,
  ]);
  // Tiap baris per warna (variant_id); baris tanpa warna tetap boleh untuk produk tanpa pilihan warna.
  for (const it of items) {
    const [p] = await q('SELECT id, active FROM products WHERE id = ?', [it.product_id]);
    const unit = String(it.unit_name || '').trim();
    const factor = Number(it.factor);
    if (!p || !p.active || !unit || !(factor > 0)) throw new BadRequest('Barang, satuan, atau isi tidak valid');
    let variantId = null;
    if (it.variant_id) {
      const [v] = await q('SELECT id FROM variants WHERE id = ? AND product_id = ? AND active = 1', [it.variant_id, p.id]);
      if (!v) throw new BadRequest('Warna tidak termasuk produk ini');
      variantId = v.id;
    }
    const harga = it.harga_perkiraan === '' || it.harga_perkiraan == null ? null : Math.round(Number(it.harga_perkiraan));
    await q('INSERT INTO purchase_order_items (po_id, product_id, variant_id, unit_name, factor, qty, harga_perkiraan) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      r.insertId, p.id, variantId, unit, factor, Number(it.qty), harga,
    ]);
  }
  return { id: r.insertId };
}

// Kirim PO ke supplier (draft -> dikirim), atau batalkan (selama belum diterima penuh).
export async function ubahStatusPO(q, id, status) {
  const [po] = await q('SELECT * FROM purchase_orders WHERE id = ? FOR UPDATE', [id]);
  if (!po) throw new BadRequest('PO tidak ditemukan');
  if (status === 'dikirim') {
    if (po.status !== 'draft') throw new BadRequest(`PO sudah ${po.status}`);
    await q("UPDATE purchase_orders SET status = 'dikirim', dikirim_pada = NOW() WHERE id = ?", [id]);
  } else if (status === 'batal') {
    if (['diterima', 'batal'].includes(po.status)) throw new BadRequest(`PO sudah ${po.status}`);
    await q("UPDATE purchase_orders SET status = 'batal', selesai_pada = NOW() WHERE id = ?", [id]);
  } else {
    throw new BadRequest('Status tidak dikenal');
  }
}

// Dipanggil saat barang masuk yang merujuk PO diterima: tambah jumlah diterima (satuan dasar) per produk,
// lalu status PO menjadi diterima sebagian atau diterima.
export async function terimaUntukPO(q, poId, purchaseId) {
  const [po] = await q('SELECT * FROM purchase_orders WHERE id = ? FOR UPDATE', [poId]);
  if (!po) return;
  const masuk = await q('SELECT product_id, SUM(qty * factor) AS dasar FROM purchase_items WHERE purchase_id = ? AND product_id IS NOT NULL GROUP BY product_id', [purchaseId]);
  const items = await q('SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY id', [po.id]);
  for (const m of masuk) {
    let sisa = Number(m.dasar);
    for (const it of items.filter((x) => x.product_id === m.product_id)) {
      if (sisa <= EPS) break;
      const kurang = Math.max(0, it.qty * it.factor - it.diterima);
      const tambah = Math.min(sisa, kurang) || 0;
      it.diterima += tambah;
      sisa -= tambah;
    }
    // Kelebihan dari PO dicatat di baris pertama produk itu (barang yang dikirim lebih dari pesanan).
    const pertama = items.find((x) => x.product_id === m.product_id);
    if (pertama && sisa > EPS) pertama.diterima += sisa;
  }
  for (const it of items) await q('UPDATE purchase_order_items SET diterima = ? WHERE id = ?', [it.diterima, it.id]);
  const lengkap = items.every((it) => it.diterima >= it.qty * it.factor - EPS);
  await q('UPDATE purchase_orders SET status = ?, selesai_pada = ? WHERE id = ?', [
    lengkap ? 'diterima' : 'diterima_sebagian', lengkap ? new Date() : null, po.id,
  ]);
}
