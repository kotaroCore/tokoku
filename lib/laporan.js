// Laporan lanjutan (M4): per kategori, tren, pergerakan stok, laris & lambat, hutang lewat tempo,
// stok rusak, dan riwayat harga beli. Semua untuk rentang tanggal [from, to] (inklusif) kecuali disebut lain.
// Laba dan nilai modal hanya dikirim ke admin / staf berizin laporan_laba (lihat app/api/reports).

import { query, queryOne } from '@/lib/db';
import { notaBerhutang } from '@/lib/hutang';

// Total diskon (rupiah) per pemberi diskon, nota lunas di rentang.
export async function diskonPerKasir(from, to) {
  return query(
    `SELECT u.name, COUNT(*) AS baris, SUM(i.diskon_rp) AS diskon
     FROM sale_items i JOIN sales s ON s.id = i.sale_id AND s.status = 'lunas' AND DATE(s.created_at) BETWEEN ? AND ?
     JOIN users u ON u.id = COALESCE(i.diskon_oleh, s.user_id)
     WHERE i.diskon_rp > 0 GROUP BY u.id, u.name ORDER BY diskon DESC`,
    [from, to]
  );
}

// Jenis perubahan stok. Baris lama (sebelum kolom jenis) ditebak dari catatannya.
export const LABEL_MUTASI = {
  masuk: 'Masuk rak', jual: 'Terjual', retur: 'Retur', cek_sore: 'Cek sore', koreksi: 'Koreksi',
  jual_rusak: 'Rusak terjual', buang: 'Rusak dibuang', retur_supplier: 'Rusak ke supplier', stok_awal: 'Stok awal', opname: 'Opname',
};
export function jenisMutasi(r) {
  if (r.jenis) return r.jenis;
  const n = r.note || '';
  if (n.startsWith('Penjualan nota')) return 'jual';
  if (n.startsWith('Retur nota')) return 'retur';
  if (n.startsWith('Masuk rak')) return 'masuk';
  if (n.startsWith('Cek sore')) return 'cek_sore';
  return 'koreksi';
}

// Baris nota lunas di rentang, dikurangi retur (nilai dan modal barang yang diretur).
const BARIS_BERSIH = `
  SELECT i.*, p.id AS product_id, p.category, s.user_id,
    i.subtotal - COALESCE(r.amount, 0) AS omset_bersih,
    (i.qty - COALESCE(r.qty, 0)) * i.factor AS qty_dasar,
    (i.qty - COALESCE(r.qty, 0)) * i.factor * i.modal AS modal_bersih
  FROM sale_items i
  JOIN sales s ON s.id = i.sale_id AND s.status = 'lunas' AND DATE(s.created_at) BETWEEN ? AND ?
  JOIN variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id
  LEFT JOIN (SELECT sale_item_id, SUM(qty) AS qty, SUM(amount) AS amount FROM sale_return_items GROUP BY sale_item_id) r ON r.sale_item_id = i.id`;

export async function perKategori(from, to) {
  const rows = await query(
    `SELECT category, SUM(omset_bersih) AS omset, SUM(omset_bersih - modal_bersih) AS laba
     FROM (${BARIS_BERSIH}) x GROUP BY category ORDER BY omset DESC`,
    [from, to]
  );
  const total = rows.reduce((t, r) => t + Number(r.omset), 0);
  return rows.map((r) => ({
    ...r, omset: Number(r.omset), laba: Math.round(Number(r.laba)),
    persen: total ? Math.round((Number(r.omset) / total) * 1000) / 10 : 0,
    margin: Number(r.omset) ? Math.round((Number(r.laba) / Number(r.omset)) * 1000) / 10 : 0,
  }));
}

export async function labaTotal(from, to) {
  const r = await queryOne(`SELECT COALESCE(SUM(omset_bersih), 0) AS omset, COALESCE(SUM(modal_bersih), 0) AS modal FROM (${BARIS_BERSIH}) x`, [from, to]);
  return { omset: Number(r.omset), modal: Math.round(Number(r.modal)), laba: Math.round(Number(r.omset) - Number(r.modal)) };
}

const KELOMPOK = {
  hari: "DATE_FORMAT(created_at, '%Y-%m-%d')",
  minggu: "DATE_FORMAT(DATE(created_at) - INTERVAL WEEKDAY(created_at) DAY, '%Y-%m-%d')", // Senin awal minggu
  bulan: "DATE_FORMAT(created_at, '%Y-%m')",
};
export async function tren(from, to, per = 'hari') {
  const k = KELOMPOK[per] || KELOMPOK.hari;
  return query(
    `SELECT ${k} AS label, COUNT(*) AS nota, COALESCE(SUM(total), 0) AS omset
     FROM sales WHERE status = 'lunas' AND DATE(created_at) BETWEEN ? AND ? GROUP BY label ORDER BY label`,
    [from, to]
  );
}

// 20 produk terlaris menurut jumlah (satuan dasar) dan menurut omset.
export async function laris(from, to) {
  const sql = (urut) => `SELECT product_id, MAX(product_name) AS product_name, MAX(category) AS category,
      SUM(qty_dasar) AS qty_dasar, SUM(omset_bersih) AS omset
    FROM (${BARIS_BERSIH}) x GROUP BY product_id ORDER BY ${urut} DESC LIMIT 20`;
  const [jumlah, omset] = await Promise.all([query(sql('qty_dasar'), [from, to]), query(sql('omset'), [from, to])]);
  const base = await query('SELECT id, base_unit FROM products');
  const unit = (rows) => rows.map((r) => ({ ...r, base_unit: base.find((b) => b.id === r.product_id)?.base_unit || '' }));
  return { jumlah: unit(jumlah), omset: unit(omset) };
}

// Produk aktif yang tidak terjual N hari terakhir (dihitung dari hari ini), beserta stok dan nilainya.
export async function lambat(hari) {
  return query(
    `SELECT p.id, p.category, p.name, p.base_unit, SUM(v.stock) AS stok, ROUND(SUM(v.stock) * p.cost) AS nilai,
       (SELECT MAX(DATE(s.created_at)) FROM sale_items i JOIN sales s ON s.id = i.sale_id AND s.status = 'lunas'
        JOIN variants v2 ON v2.id = i.variant_id WHERE v2.product_id = p.id) AS terakhir_terjual
     FROM products p JOIN variants v ON v.product_id = p.id AND v.active = 1
     WHERE p.active = 1 AND NOT EXISTS (
       SELECT 1 FROM sale_items i JOIN sales s ON s.id = i.sale_id AND s.status = 'lunas'
       JOIN variants v3 ON v3.id = i.variant_id
       WHERE v3.product_id = p.id AND s.created_at >= CURDATE() - INTERVAL ? DAY)
     GROUP BY p.id HAVING stok > 0 ORDER BY nilai DESC`,
    [hari]
  );
}

// Hutang lewat jatuh tempo per pembeli dan per nota, dengan umur hutang (hari sejak nota).
export async function hutangLewat() {
  const customers = await query('SELECT id, name, phone FROM customers WHERE total_hutang > 0');
  const notas = (await notaBerhutang(customers.map((c) => c.id))).filter((n) => n.lewat);
  return customers
    .map((c) => {
      const n = notas.filter((x) => x.customer_id === c.id);
      return { ...c, notas: n, total: n.reduce((t, x) => t + Number(x.sisa), 0), umur_terlama: Math.max(0, ...n.map((x) => x.umur)) };
    })
    .filter((c) => c.notas.length)
    .sort((a, b) => b.total - a.total);
}

// Stok rusak sekarang per produk, dan yang dibuang / dijual / dikembalikan di rentang.
export async function rusak(from, to) {
  const sekarang = await query(
    `SELECT p.id, p.name, p.base_unit, SUM(v.stok_rusak) AS stok_rusak, ROUND(SUM(v.stok_rusak) * p.cost) AS nilai
     FROM variants v JOIN products p ON p.id = v.product_id GROUP BY p.id HAVING stok_rusak > 0 ORDER BY nilai DESC`
  );
  const keluar = await query(
    `SELECT p.id, p.name, p.base_unit,
       SUM(CASE WHEN a.jenis = 'buang' THEN -a.delta ELSE 0 END) AS dibuang,
       SUM(CASE WHEN a.jenis = 'buang' THEN a.nilai ELSE 0 END) AS nilai_dibuang,
       SUM(CASE WHEN a.jenis = 'jual_rusak' THEN -a.delta ELSE 0 END) AS dijual,
       SUM(CASE WHEN a.jenis = 'retur_supplier' THEN -a.delta ELSE 0 END) AS dikembalikan
     FROM stock_adjustments a JOIN variants v ON v.id = a.variant_id JOIN products p ON p.id = v.product_id
     WHERE a.kolom = 'rusak' AND a.jenis IN ('buang', 'jual_rusak', 'retur_supplier') AND DATE(a.created_at) BETWEEN ? AND ?
     GROUP BY p.id ORDER BY nilai_dibuang DESC`,
    [from, to]
  );
  const kerugian = keluar.reduce((t, r) => t + Number(r.nilai_dibuang || 0), 0);
  return { sekarang, keluar, kerugian };
}

// Pergerakan stok satu produk (opsional satu warna) dengan saldo berjalan.
// Saldo dihitung mundur dari stok sekarang, jadi stok awal yang diisi sebelum ada catatan tetap benar.
export async function pergerakanStok(productId, from, to, variantId = null) {
  const [p] = await query('SELECT id, name, base_unit FROM products WHERE id = ?', [productId]);
  if (!p) return null;
  const filter = variantId ? 'v.id = ?' : 'v.product_id = ?';
  const id = variantId || productId;
  const [now] = await query(`SELECT COALESCE(SUM(stock), 0) AS jual, COALESCE(SUM(stok_rusak), 0) AS rusak FROM variants v WHERE ${filter}`, [id]);
  const [sesudah] = await query(
    `SELECT COALESCE(SUM(CASE WHEN a.kolom = 'rusak' THEN 0 ELSE a.delta END), 0) AS jual,
            COALESCE(SUM(CASE WHEN a.kolom = 'rusak' THEN a.delta ELSE 0 END), 0) AS rusak
     FROM stock_adjustments a JOIN variants v ON v.id = a.variant_id WHERE ${filter} AND DATE(a.created_at) > ?`,
    [id, to]
  );
  const rows = await query(
    `SELECT a.id, a.created_at, a.delta, a.note, a.kolom, a.jenis, v.color, u.name AS oleh
     FROM stock_adjustments a JOIN variants v ON v.id = a.variant_id JOIN users u ON u.id = a.user_id
     WHERE ${filter} AND DATE(a.created_at) BETWEEN ? AND ? ORDER BY a.created_at, a.id`,
    [id, from, to]
  );
  const akhir = { jual: Number(now.jual) - Number(sesudah.jual), rusak: Number(now.rusak) - Number(sesudah.rusak) };
  const saldo = { jual: akhir.jual - rows.reduce((t, r) => t + (r.kolom === 'rusak' ? 0 : r.delta), 0), rusak: akhir.rusak - rows.reduce((t, r) => t + (r.kolom === 'rusak' ? r.delta : 0), 0) };
  const awal = { ...saldo };
  const ringkas = {};
  const out = rows.map((r) => {
    const k = r.kolom === 'rusak' ? 'rusak' : 'jual';
    saldo[k] += r.delta;
    const jenis = jenisMutasi(r);
    ringkas[jenis] = (ringkas[jenis] || 0) + r.delta;
    return { ...r, jenis, label: LABEL_MUTASI[jenis] || jenis, saldo_jual: saldo.jual, saldo_rusak: saldo.rusak };
  });
  return { product: p, awal, akhir, ringkas, rows: out };
}

// Riwayat harga beli satu produk: harga per satuan beli di setiap barang masuk (barang pengganti Rp 0 tidak ikut).
export async function riwayatHargaBeli(productId) {
  return query(
    `SELECT pu.id AS purchase_id, DATE(pu.created_at) AS tanggal, i.unit_name, i.factor, i.qty, i.unit_cost, s.name AS supplier
     FROM purchase_items i JOIN purchases pu ON pu.id = i.purchase_id LEFT JOIN suppliers s ON s.id = pu.supplier_id
     LEFT JOIN variants v ON v.id = i.variant_id
     WHERE COALESCE(i.product_id, v.product_id) = ? AND pu.retur_supplier_id IS NULL AND pu.status <> 'hilang'
     ORDER BY pu.created_at, i.id`,
    [productId]
  );
}
