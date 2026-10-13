-- =====================================================================
-- MIGRASI DATA: prototipe lama -> skema Fase 1
--
-- Prasyarat:
--   1. Database lama diimpor ke nama `tokoku_lama` (dump tokoku.sql
--      menyebut `tokoku`; hapus baris CREATE DATABASE dan USE di dump,
--      atau ganti namanya sebelum impor).
--   2. Database baru dibuat dan skema dijalankan:
--        CREATE DATABASE tokoku_fase1 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--        USE tokoku_fase1;
--        SOURCE db/schema_fase1.sql;
--   3. Jalankan skrip ini di database `tokoku_fase1`.
--
-- Keputusan default (bisa diubah sebelum dijalankan):
--   - base_unit 'buah' -> 'biji'
--   - kode produk = 'P' + id (dirapikan manual nanti)
--   - unit 'mass' dan 'paket' ditandai paket_tertutup = 1
--   - stok lama dicatat sebagai mutasi 'awal' (riwayat jual lama tidak
--     dimasukkan ke mutasi, karena stok sudah tercermin di stok awal)
--   - nota lama dianggap lunas; kembalian lama tidak tercatat di skema baru
--   - metode e-wallet lama (tidak tercatat di prototipe) dipetakan ke 'qris'
--   - password hash ikut disalin (semua user masih memakai tokoku123)
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1. Kategori: tambahkan yang belum ada (mis. BENIK JEANS GOYANG)
-- ---------------------------------------------------------------------
INSERT INTO kategori (nama)
SELECT DISTINCT p.category
FROM tokoku_lama.products p
WHERE p.category NOT IN (SELECT nama FROM kategori);

-- ---------------------------------------------------------------------
-- 2. User & shift (id dipertahankan agar referensi tetap cocok)
-- ---------------------------------------------------------------------
INSERT INTO `user` (id, nama, username, password_hash, boleh_ubah_harga, aktif)
SELECT id, name, username, password_hash, IF(role = 'owner', 1, 0), active
FROM tokoku_lama.users;

INSERT INTO shift (id, user_id, mulai, selesai)
SELECT id, user_id, started_at, ended_at
FROM tokoku_lama.shifts;

-- ---------------------------------------------------------------------
-- 3. Supplier (belum dipakai di Fase 1, tapi datanya disalin)
-- ---------------------------------------------------------------------
INSERT INTO supplier (id, nama, alamat, no_wa, catatan)
SELECT id, name, address, phone, note
FROM tokoku_lama.suppliers;

-- ---------------------------------------------------------------------
-- 4. Produk, satuan harga, varian
-- ---------------------------------------------------------------------
INSERT INTO produk (id, kategori_id, kode, nama, satuan_dasar, harga_beli_terakhir, aktif)
SELECT p.id,
       k.id,
       CONCAT('P', LPAD(p.id, 4, '0')),
       p.name,
       CASE WHEN p.base_unit IN ('biji', 'meter', 'paket') THEN p.base_unit ELSE 'biji' END,
       NULLIF(p.cost, 0),
       p.active
FROM tokoku_lama.products p
JOIN kategori k ON k.nama = p.category;

INSERT INTO satuan_harga (id, produk_id, nama_satuan, isi, harga_jual, paket_tertutup, aktif)
SELECT u.id,
       u.product_id,
       u.name,
       u.factor,
       ROUND(u.price),
       IF(u.name IN ('mass', 'paket'), 1, 0),
       1
FROM tokoku_lama.units u;

INSERT INTO varian (id, produk_id, kode_warna, nama_warna, stok, stok_rusak, batas_kuning, batas_merah, aktif)
SELECT v.id,
       v.product_id,
       IF(v.color = '', '-', v.color),
       NULLIF(v.color, ''),
       ROUND(v.stock, 3),
       0,
       NULLIF(v.level_yellow, 0),
       NULLIF(v.level_red, 0),
       1
FROM tokoku_lama.variants v;

-- Saldo awal stok: stok sistem saat ini dicatat sebagai mutasi 'awal'
INSERT INTO mutasi_stok (varian_id, jenis, kolom, jumlah, saldo_sesudah, ref_tipe, alasan, user_id, waktu)
SELECT id, 'awal', 'stok', stok, stok, NULL, 'Migrasi dari prototipe', 1, NOW()
FROM varian
WHERE stok > 0;

-- ---------------------------------------------------------------------
-- 5. Nota lunas (dari sales) dan itemnya (dari sale_items)
--    Stok lama sudah berkurang saat penjualan, jadi stok_dikurangi = 1
--    dan stok TIDAK diubah di sini.
-- ---------------------------------------------------------------------
INSERT INTO nota (id, nomor, jenis, status, konsumen_id, total_barang, ongkir,
                  bayar_hutang_lama, total_tagihan, total_akhir, pembulatan,
                  kelebihan_ke_saldo, dibuat_oleh, dibuat_pada, lunas_oleh, lunas_pada)
SELECT s.id,
       CONCAT('NT-', DATE_FORMAT(s.created_at, '%Y%m%d'), '-', LPAD(s.id, 4, '0')),
       IF(s.channel = 'online', 'online', 'toko'),
       'lunas',
       NULL,
       ROUND(s.total), 0, 0,
       ROUND(s.total), ROUND(s.total), 0,
       0,
       s.user_id, s.created_at, s.user_id, s.created_at
FROM tokoku_lama.sales s;

INSERT INTO nota_item (id, nota_id, produk_id, varian_id, satuan_harga_id, nama_satuan, isi,
                       jumlah, harga_satuan, diskon, jenis_diskon, diskon_oleh, subtotal,
                       dari_stok_rusak, boleh_retur_beda_warna, stok_dikurangi)
SELECT si.id,
       si.sale_id,
       v.product_id,
       si.variant_id,
       sh.id,
       si.unit_name,
       si.factor,
       si.qty,
       ROUND(si.unit_price),
       GREATEST(0, ROUND(si.qty * si.unit_price) - ROUND(si.subtotal)),
       IF(si.discount_pct > 0, 'staf', NULL),
       IF(si.discount_pct > 0, s.user_id, NULL),
       ROUND(si.subtotal),
       0, 0, 1
FROM tokoku_lama.sale_items si
JOIN tokoku_lama.sales s    ON s.id = si.sale_id
JOIN tokoku_lama.variants v ON v.id = si.variant_id
JOIN satuan_harga sh        ON sh.produk_id = v.product_id AND sh.nama_satuan = si.unit_name;

-- ---------------------------------------------------------------------
-- 6. Pembayaran: dipecah dari kolom paid_* di tabel sales
--    Cash dihitung bersih (tanpa kembalian), agar total pembayaran
--    sama dengan total nota.
-- ---------------------------------------------------------------------
INSERT INTO pembayaran (nota_id, metode, jumlah, status, dibuat_pada, dikonfirmasi_oleh, dikonfirmasi_pada)
SELECT s.id, 'cash',
       ROUND(LEAST(s.paid_cash, s.total - s.paid_ewallet - s.paid_transfer)),
       'diterima', s.created_at, s.user_id, s.created_at
FROM tokoku_lama.sales s
WHERE LEAST(s.paid_cash, s.total - s.paid_ewallet - s.paid_transfer) > 0;

INSERT INTO pembayaran (nota_id, metode, jumlah, status, dibuat_pada, dikonfirmasi_oleh, dikonfirmasi_pada)
SELECT s.id, 'qris', ROUND(s.paid_ewallet), 'diterima', s.created_at, s.user_id, s.created_at
FROM tokoku_lama.sales s
WHERE s.paid_ewallet > 0;

INSERT INTO pembayaran (nota_id, metode, jumlah, status, dibuat_pada, dikonfirmasi_oleh, dikonfirmasi_pada)
SELECT s.id, 'transfer', ROUND(s.paid_transfer), 'diterima', s.created_at, s.user_id, s.created_at
FROM tokoku_lama.sales s
WHERE s.paid_transfer > 0;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- 7. Pemeriksaan: jalankan setelah migrasi, bandingkan hasilnya
-- ---------------------------------------------------------------------
-- a. Jumlah baris
SELECT 'produk'     AS tabel, (SELECT COUNT(*) FROM tokoku_lama.products) AS lama, (SELECT COUNT(*) FROM produk) AS baru
UNION ALL SELECT 'varian',    (SELECT COUNT(*) FROM tokoku_lama.variants), (SELECT COUNT(*) FROM varian)
UNION ALL SELECT 'nota',      (SELECT COUNT(*) FROM tokoku_lama.sales),    (SELECT COUNT(*) FROM nota)
UNION ALL SELECT 'nota_item', (SELECT COUNT(*) FROM tokoku_lama.sale_items), (SELECT COUNT(*) FROM nota_item)
UNION ALL SELECT 'user',      (SELECT COUNT(*) FROM tokoku_lama.users),    (SELECT COUNT(*) FROM `user`)
UNION ALL SELECT 'shift',     (SELECT COUNT(*) FROM tokoku_lama.shifts),   (SELECT COUNT(*) FROM shift);

-- b. Total stok harus sama
SELECT (SELECT ROUND(SUM(stock), 3) FROM tokoku_lama.variants) AS stok_lama,
       (SELECT SUM(stok) FROM varian)                         AS stok_baru;

-- c. Total omset harus sama
SELECT (SELECT SUM(total) FROM tokoku_lama.sales) AS omset_lama,
       (SELECT SUM(total_akhir) FROM nota)         AS omset_baru;

-- d. Data yang TIDAK ikut dimigrasi (harus 0 agar aman)
--    Jika ada angka > 0, migrasi perlu ditambah sebelum dipakai.
SELECT (SELECT COUNT(*) FROM tokoku_lama.customers)                              AS konsumen_lama,
       (SELECT COUNT(*) FROM tokoku_lama.debt_payments)                          AS bayar_hutang_lama,
       (SELECT COUNT(*) FROM tokoku_lama.sales WHERE hutang > 0)                 AS nota_berhutang,
       (SELECT COUNT(*) FROM tokoku_lama.stock_adjustments)                      AS koreksi_stok_lama,
       (SELECT COUNT(*) FROM tokoku_lama.purchases)                              AS pembelian_lama,
       (SELECT COUNT(*) FROM tokoku_lama.sale_returns)                           AS retur_lama;
