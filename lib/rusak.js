// Tindak lanjut stok rusak: dijual (lewat kasir, lib/sales.js), dibuang, atau dikembalikan ke supplier.
// Semuanya mengurangi stok_rusak, tidak menyentuh stok jual, dan tercatat di stock_adjustments (kolom 'rusak').

import { BadRequest } from '@/lib/sales';
import { wajibIzin } from '@/lib/izin';
import { catatDompet } from '@/lib/dompet';

const EPS = 1e-9;
export const STATUS_RETUR = ['dikirim', 'diganti', 'diuangkan', 'ditolak'];

async function kurangiRusak(q, { variantId, qty, userId, note, jenis, nilai = null }) {
  const [v] = await q(
    'SELECT v.*, p.name AS product_name, p.cost FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? FOR UPDATE',
    [variantId]
  );
  if (!v) throw new BadRequest('Warna tidak ditemukan');
  if (!(qty > 0)) throw new BadRequest('Jumlah harus lebih dari 0');
  if (v.stok_rusak < qty - EPS) throw new BadRequest(`Stok rusak ${v.product_name} ${v.color} tidak cukup (sisa ${v.stok_rusak})`);
  await q('UPDATE variants SET stok_rusak = GREATEST(0, stok_rusak - ?) WHERE id = ?', [qty, v.id]);
  await q('INSERT INTO stock_adjustments (variant_id, user_id, delta, note, kolom, jenis, nilai) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    v.id, userId, -qty, note.slice(0, 255), 'rusak', jenis, nilai,
  ]);
  return v;
}

// Buang barang rusak: hanya admin atau staf berizin. Nilai (jumlah x harga beli) tampil di laporan sebagai kerugian.
export async function buangRusak(q, session, { variantId, qty, alasan }) {
  wajibIzin(session, 'buang_rusak');
  const why = String(alasan || '').trim();
  if (!why) throw new BadRequest('Alasan membuang wajib diisi');
  const [p] = await q('SELECT p.cost FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?', [variantId]);
  const nilai = Math.round(Number(qty) * Number(p?.cost || 0));
  await kurangiRusak(q, { variantId, qty: Number(qty), userId: session.uid, note: `Buang: ${why}`, jenis: 'buang', nilai });
  return { nilai };
}

// Kirim barang rusak ke supplier. Stok rusak langsung berkurang (status dikirim).
export async function buatReturSupplier(q, session, b) {
  const [s] = await q('SELECT * FROM suppliers WHERE id = ?', [b.supplier_id]);
  if (!s || !s.active) throw new BadRequest('Pilih supplier yang aktif');
  const items = (b.items || []).filter((i) => Number(i.qty) > 0);
  if (!items.length) throw new BadRequest('Isi jumlah barang yang dikembalikan');
  const r = await q('INSERT INTO retur_supplier (supplier_id, user_id, catatan) VALUES (?, ?, ?)', [
    s.id, session.uid, String(b.catatan || '').trim() || null,
  ]);
  let nilai = 0;
  const seen = new Set();
  for (const it of items) {
    if (seen.has(Number(it.variant_id))) throw new BadRequest('Warna yang sama terisi dua kali');
    seen.add(Number(it.variant_id));
    const qty = Number(it.qty);
    const v = await kurangiRusak(q, { variantId: Number(it.variant_id), qty, userId: session.uid, note: `Retur ke supplier ${s.name} #${r.insertId}`, jenis: 'retur_supplier' });
    await q('INSERT INTO retur_supplier_item (retur_supplier_id, variant_id, qty, harga_beli) VALUES (?, ?, ?, ?)', [r.insertId, v.id, qty, v.cost]);
    nilai += qty * Number(v.cost);
  }
  await q('UPDATE retur_supplier SET nilai = ? WHERE id = ?', [Math.round(nilai), r.insertId]);
  return { id: r.insertId, nilai: Math.round(nilai) };
}

// Selesaikan retur supplier yang masih dikirim:
// - diganti: dibuat barang masuk Rp 0 (status diterima) yang merujuk retur ini; staf memasukkannya ke rak seperti biasa.
// - diuangkan: uang masuk ke dompet kulakan.
// - ditolak: barang kembali ke stok rusak.
export async function selesaikanReturSupplier(q, session, id, { status, uang, catatan }) {
  const [r] = await q('SELECT * FROM retur_supplier WHERE id = ? FOR UPDATE', [id]);
  if (!r) throw new BadRequest('Retur supplier tidak ditemukan');
  if (r.status !== 'dikirim') throw new BadRequest(`Retur ini sudah ${r.status}`);
  if (!['diganti', 'diuangkan', 'ditolak'].includes(status)) throw new BadRequest('Status tidak dikenal');
  const items = await q(
    `SELECT i.*, v.product_id, p.name AS product_name, p.base_unit FROM retur_supplier_item i
     JOIN variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id WHERE i.retur_supplier_id = ?`,
    [r.id]
  );
  let uangKembali = null;
  let purchaseId = null;

  if (status === 'diganti') {
    const pu = await q(
      "INSERT INTO purchases (supplier_id, user_id, shift_id, total, pay_method, note, status, retur_supplier_id) VALUES (?, ?, ?, 0, 'cash', ?, 'diterima', ?)",
      [r.supplier_id, session.uid, session.shiftId ?? null, `Pengganti retur supplier #${r.id}`, r.id]
    );
    purchaseId = pu.insertId;
    // Satu baris per produk dalam satuan dasar; warnanya ditentukan saat masuk rak.
    const perProduk = new Map();
    for (const it of items) {
      const g = perProduk.get(it.product_id) || { name: it.product_name, unit: it.base_unit, qty: 0 };
      g.qty += it.qty;
      perProduk.set(it.product_id, g);
    }
    for (const [pid, g] of perProduk) {
      await q(
        `INSERT INTO purchase_items (purchase_id, product_id, variant_id, product_name, color, unit_name, qty, factor, unit_cost, subtotal)
         VALUES (?, ?, NULL, ?, '', ?, ?, 1, 0, 0)`,
        [purchaseId, pid, g.name, g.unit, g.qty]
      );
    }
  } else if (status === 'diuangkan') {
    uangKembali = Math.round(uang == null || uang === '' ? r.nilai : Number(uang));
    if (!(uangKembali >= 0)) throw new BadRequest('Jumlah uang tidak valid');
    await catatDompet(q, { dompet: 'kulakan', jumlah: uangKembali, jenis: 'retur_supplier', keterangan: `Retur supplier #${r.id}`, userId: session.uid });
  } else {
    for (const it of items) {
      await q('UPDATE variants SET stok_rusak = stok_rusak + ? WHERE id = ?', [it.qty, it.variant_id]);
      await q('INSERT INTO stock_adjustments (variant_id, user_id, delta, note, kolom, jenis) VALUES (?, ?, ?, ?, ?, ?)', [
        it.variant_id, session.uid, it.qty, `Retur supplier #${r.id} ditolak`, 'rusak', 'retur_supplier',
      ]);
    }
  }
  const note = String(catatan || '').trim();
  await q(
    'UPDATE retur_supplier SET status = ?, uang_kembali = ?, selesai_pada = NOW(), selesai_oleh = ?, catatan = COALESCE(?, catatan) WHERE id = ?',
    [status, uangKembali, session.uid, note ? `${r.catatan ? r.catatan + ' | ' : ''}${note}` : null, r.id]
  );
  return { id: r.id, status, purchaseId, uangKembali };
}
