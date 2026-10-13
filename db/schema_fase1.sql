-- =====================================================================
-- SKEMA DATABASE WEB TOKO - FASE 1 (MVP)
-- Target: MySQL/MariaDB (XAMPP), engine InnoDB (wajib untuk transaksi)
-- MariaDB >= 10.2 diperlukan agar CHECK constraint benar-benar dijaga
-- Uang dalam Rupiah utuh (BIGINT). Jumlah barang DECIMAL(12,3) agar
-- bisa menampung meter (contoh 0.450 m).
-- Dokumen rujukan: SKEMA_DATABASE_FASE1.md
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- BAGIAN 6 (dibuat duluan karena dirujuk banyak tabel): USER
-- ---------------------------------------------------------------------
CREATE TABLE `user` (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  nama              VARCHAR(100) NOT NULL,
  username          VARCHAR(50)  NOT NULL UNIQUE,
  password_hash     VARCHAR(255) NOT NULL,
  boleh_ubah_harga  TINYINT(1)   NOT NULL DEFAULT 0,   -- ibu & admin = 1
  aktif             TINYINT(1)   NOT NULL DEFAULT 1,
  dibuat_pada       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE shift (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  user_id   INT NOT NULL,
  mulai     DATETIME NOT NULL,
  selesai   DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES `user`(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Nilai yang bisa diubah tanpa mengubah kode
CREATE TABLE pengaturan (
  kunci   VARCHAR(50) PRIMARY KEY,
  nilai   VARCHAR(1000) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Penomoran otomatis harian yang aman walau 2 staf menyimpan bersamaan
CREATE TABLE nomor_urut (
  jenis     VARCHAR(5) NOT NULL,      -- NT, RT, BM
  tanggal   DATE       NOT NULL,
  terakhir  INT        NOT NULL DEFAULT 0,
  PRIMARY KEY (jenis, tanggal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- BAGIAN 1: PRODUK, HARGA, STOK
-- ---------------------------------------------------------------------
CREATE TABLE kategori (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  nama  VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE produk (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  kategori_id           INT NOT NULL,
  kode                  VARCHAR(50)  NOT NULL UNIQUE,
  nama                  VARCHAR(150) NOT NULL,
  satuan_dasar          ENUM('biji','meter','paket') NOT NULL DEFAULT 'biji',
  harga_beli_terakhir   DECIMAL(14,4) NULL,            -- per satuan dasar
  batas_kuning_bawaan   DECIMAL(12,3) NULL,
  batas_merah_bawaan    DECIMAL(12,3) NULL,
  aktif                 TINYINT(1) NOT NULL DEFAULT 1,
  dibuat_pada           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (kategori_id) REFERENCES kategori(id),
  INDEX idx_produk_nama (nama)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE satuan_harga (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  produk_id       INT NOT NULL,
  nama_satuan     VARCHAR(30)   NOT NULL,              -- biji, dosin, gross, mass, meter, paket
  isi             DECIMAL(12,3) NOT NULL,              -- dalam satuan dasar: dosin=12, mass=1728
  harga_jual      BIGINT        NOT NULL,
  paket_tertutup  TINYINT(1)    NOT NULL DEFAULT 0,    -- retur hanya utuh 1 paket
  aktif           TINYINT(1)    NOT NULL DEFAULT 1,
  UNIQUE KEY uk_produk_satuan (produk_id, nama_satuan),
  FOREIGN KEY (produk_id) REFERENCES produk(id),
  CHECK (isi > 0),
  CHECK (harga_jual >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE varian (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  produk_id     INT NOT NULL,
  kode_warna    VARCHAR(30) NOT NULL,                  -- '-' untuk produk tanpa warna
  nama_warna    VARCHAR(50) NULL,
  stok          DECIMAL(14,6) NOT NULL DEFAULT 0,      -- stok jual (toko+gudang digabung); 6 desimal agar hasil konversi (mis. 13.333333) tidak terpotong
  stok_rusak    DECIMAL(14,6) NOT NULL DEFAULT 0,
  batas_kuning  DECIMAL(12,3) NULL,                    -- NULL = pakai bawaan produk
  batas_merah   DECIMAL(12,3) NULL,
  aktif         TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uk_produk_warna (produk_id, kode_warna),
  FOREIGN KEY (produk_id) REFERENCES produk(id),
  CHECK (stok >= 0),                                   -- stok TIDAK BOLEH minus
  CHECK (stok_rusak >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mutasi_stok (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  varian_id      INT NOT NULL,
  jenis          ENUM('awal','jual','isi_warna','retur_masuk','masuk','koreksi',
                      'ke_rusak','jual_rusak','hapus_rusak','retur_supplier') NOT NULL,
  kolom          ENUM('stok','stok_rusak') NOT NULL,
  jumlah         DECIMAL(14,6) NOT NULL,               -- + bertambah, - berkurang
  saldo_sesudah  DECIMAL(14,6) NOT NULL,
  ref_tipe       VARCHAR(20) NULL,                     -- nota, retur, barang_masuk
  ref_id         BIGINT NULL,
  alasan         VARCHAR(255) NULL,                    -- WAJIB untuk koreksi (dijaga aplikasi)
  user_id        INT NOT NULL,
  waktu          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (varian_id) REFERENCES varian(id),
  FOREIGN KEY (user_id) REFERENCES `user`(id),
  INDEX idx_mutasi_varian_waktu (varian_id, waktu),
  INDEX idx_mutasi_ref (ref_tipe, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- BAGIAN 5: SUPPLIER & BARANG MASUK (sebelum riwayat_harga karena dirujuk)
-- ---------------------------------------------------------------------
CREATE TABLE supplier (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  nama     VARCHAR(150) NOT NULL,
  alamat   VARCHAR(255) NULL,
  no_wa    VARCHAR(20)  NULL,
  catatan  VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE barang_masuk (
  id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
  nomor                VARCHAR(20) NOT NULL UNIQUE,    -- BM-20261005-0001
  supplier_id          INT NOT NULL,
  nomor_nota_supplier  VARCHAR(50) NULL,
  cara                 ENUM('ambil_sendiri','dikirim_supplier','gosend') NOT NULL,
  status               ENUM('dalam_perjalanan','diterima','hilang') NOT NULL,
  total                BIGINT NOT NULL DEFAULT 0,
  metode_bayar         ENUM('cash','transfer') NULL,
  dibayar_pada         DATETIME NULL,
  dicatat_oleh         INT NOT NULL,
  waktu_beli           DATETIME NOT NULL,
  diterima_oleh        INT NULL,
  waktu_terima         DATETIME NULL,                  -- = tanggal update harga
  catatan              VARCHAR(255) NULL,
  FOREIGN KEY (supplier_id)   REFERENCES supplier(id),
  FOREIGN KEY (dicatat_oleh)  REFERENCES `user`(id),
  FOREIGN KEY (diterima_oleh) REFERENCES `user`(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE barang_masuk_item (
  id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
  barang_masuk_id    BIGINT NOT NULL,
  varian_id          INT NOT NULL,
  satuan             VARCHAR(30)   NOT NULL,           -- kardus/dosin/mass...
  isi                DECIMAL(12,3) NOT NULL,           -- dalam satuan dasar
  jumlah             DECIMAL(12,3) NOT NULL,           -- dalam satuan beli
  harga_beli_satuan  BIGINT        NOT NULL,
  jumlah_cacat       DECIMAL(12,3) NOT NULL DEFAULT 0, -- dalam satuan dasar
  FOREIGN KEY (barang_masuk_id) REFERENCES barang_masuk(id),
  FOREIGN KEY (varian_id) REFERENCES varian(id),
  CHECK (jumlah > 0),
  CHECK (jumlah_cacat >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE riwayat_harga (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  satuan_harga_id  INT NOT NULL,
  harga_lama       BIGINT NOT NULL,
  harga_baru       BIGINT NOT NULL,
  alasan           VARCHAR(255) NULL,
  barang_masuk_id  BIGINT NULL,
  diubah_oleh      INT NOT NULL,
  waktu            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (satuan_harga_id) REFERENCES satuan_harga(id),
  FOREIGN KEY (barang_masuk_id) REFERENCES barang_masuk(id),
  FOREIGN KEY (diubah_oleh)     REFERENCES `user`(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE peringatan_harga (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  produk_id        INT NOT NULL,
  barang_masuk_id  BIGINT NOT NULL,
  harga_beli_lama  DECIMAL(14,4) NULL,
  harga_beli_baru  DECIMAL(14,4) NOT NULL,
  status           ENUM('baru','harga_diubah','tidak_perlu') NOT NULL DEFAULT 'baru',
  ditangani_oleh   INT NULL,
  ditangani_pada   DATETIME NULL,
  FOREIGN KEY (produk_id)       REFERENCES produk(id),
  FOREIGN KEY (barang_masuk_id) REFERENCES barang_masuk(id),
  FOREIGN KEY (ditangani_oleh)  REFERENCES `user`(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- BAGIAN 3: KONSUMEN (hanya yang berhutang / punya saldo titipan)
-- ---------------------------------------------------------------------
CREATE TABLE konsumen (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  nama         VARCHAR(150) NOT NULL,                  -- wajib spesifik
  alias        VARCHAR(150) NULL,
  alamat       VARCHAR(255) NULL,
  no_wa        VARCHAR(20)  NULL,
  dibuat_oleh  INT NOT NULL,
  dibuat_pada  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dibuat_oleh) REFERENCES `user`(id),
  INDEX idx_konsumen_nama (nama),
  INDEX idx_konsumen_alias (alias)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ada >= 1 baris di sini  => konsumen tier B (dikenal). Tier tidak disimpan.
CREATE TABLE konsumen_dikenal (
  konsumen_id  INT NOT NULL,
  user_id      INT NOT NULL,
  waktu        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (konsumen_id, user_id),
  FOREIGN KEY (konsumen_id) REFERENCES konsumen(id),
  FOREIGN KEY (user_id)     REFERENCES `user`(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- BAGIAN 2: NOTA & PEMBAYARAN
-- ---------------------------------------------------------------------
CREATE TABLE nota (
  id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
  nomor                VARCHAR(20) NOT NULL UNIQUE,    -- NT-20261005-0012
  jenis                ENUM('toko','online','bayar_hutang') NOT NULL DEFAULT 'toko',
  status               ENUM('draft','lunas','batal') NOT NULL DEFAULT 'draft',
  konsumen_id          INT NULL,
  total_barang         BIGINT NOT NULL DEFAULT 0,      -- jumlah subtotal item
  ongkir               BIGINT NOT NULL DEFAULT 0,      -- khusus online
  bayar_hutang_lama    BIGINT NOT NULL DEFAULT 0,      -- bagian yang melunasi hutang lama
  total_tagihan        BIGINT NOT NULL DEFAULT 0,      -- = total_barang + ongkir + bayar_hutang_lama
  total_akhir          BIGINT NULL,                    -- DIKETIK STAF (setelah pembulatan manual)
  pembulatan           BIGINT NOT NULL DEFAULT 0,      -- catatan: total_akhir - total_tagihan
  kelebihan_ke_saldo   BIGINT NOT NULL DEFAULT 0,      -- kelebihan transfer -> saldo titipan
  catatan              VARCHAR(255) NULL,
  dibuat_oleh          INT NOT NULL,
  dibuat_pada          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lunas_oleh           INT NULL,
  lunas_pada           DATETIME NULL,
  batal_oleh           INT NULL,
  batal_pada           DATETIME NULL,
  alasan_batal         VARCHAR(255) NULL,
  FOREIGN KEY (konsumen_id) REFERENCES konsumen(id),
  FOREIGN KEY (dibuat_oleh) REFERENCES `user`(id),
  FOREIGN KEY (lunas_oleh)  REFERENCES `user`(id),
  FOREIGN KEY (batal_oleh)  REFERENCES `user`(id),
  INDEX idx_nota_status (status),
  INDEX idx_nota_lunas_pada (lunas_pada)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE nota_item (
  id                      BIGINT AUTO_INCREMENT PRIMARY KEY,
  nota_id                 BIGINT NOT NULL,
  produk_id               INT NOT NULL,
  varian_id               INT NULL,                    -- BOLEH KOSONG, diisi saat cek sore
  satuan_harga_id         INT NOT NULL,
  nama_satuan             VARCHAR(30)   NOT NULL,      -- disalin saat transaksi
  isi                     DECIMAL(12,3) NOT NULL,      -- disalin saat transaksi
  jumlah                  DECIMAL(12,3) NOT NULL,      -- dalam satuan jual
  harga_satuan            BIGINT        NOT NULL,      -- disalin saat transaksi
  diskon                  BIGINT        NOT NULL DEFAULT 0,
  jenis_diskon            ENUM('tetap','cacat','staf') NULL,
  diskon_oleh             INT NULL,
  alasan_diskon           VARCHAR(255) NULL,           -- boleh kosong
  subtotal                BIGINT NOT NULL,
  dari_stok_rusak         TINYINT(1) NOT NULL DEFAULT 0,
  boleh_retur_beda_warna  TINYINT(1) NOT NULL DEFAULT 0, -- benang: kesepakatan saat beli
  stok_dikurangi          TINYINT(1) NOT NULL DEFAULT 0, -- 0 = menunggu warna diisi
  warna_diisi_oleh        INT NULL,
  warna_diisi_pada        DATETIME NULL,
  FOREIGN KEY (nota_id)          REFERENCES nota(id),
  FOREIGN KEY (produk_id)        REFERENCES produk(id),
  FOREIGN KEY (varian_id)        REFERENCES varian(id),
  FOREIGN KEY (satuan_harga_id)  REFERENCES satuan_harga(id),
  FOREIGN KEY (diskon_oleh)      REFERENCES `user`(id),
  FOREIGN KEY (warna_diisi_oleh) REFERENCES `user`(id),
  CHECK (jumlah > 0),
  CHECK (diskon >= 0),
  CHECK (boleh_retur_beda_warna = 0 OR varian_id IS NOT NULL)  -- perjanjian benang wajib ada warna
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- BAGIAN 4: RETUR
-- ---------------------------------------------------------------------
CREATE TABLE retur (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  nomor               VARCHAR(20) NOT NULL UNIQUE,     -- RT-20261005-0003
  nota_asal_id        BIGINT NOT NULL,
  nilai_acuan_sistem  BIGINT NOT NULL,                 -- dihitung dari nota asal
  nilai_retur         BIGINT NOT NULL,                 -- DITENTUKAN STAF
  ke_hutang           BIGINT NOT NULL DEFAULT 0,       -- mengurangi hutang (didahulukan)
  ke_saldo            BIGINT NOT NULL DEFAULT 0,       -- jadi saldo titipan
  uang_kembali        BIGINT NOT NULL DEFAULT 0,       -- cash dari laci
  untuk_tukar         BIGINT NOT NULL DEFAULT 0,       -- dipakai di nota tukar
  nota_tukar_id       BIGINT NULL,
  ada_pengecualian    TINYINT(1) NOT NULL DEFAULT 0,   -- melewati aturan dgn catatan
  catatan             VARCHAR(500) NULL,
  user_id             INT NOT NULL,
  waktu               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (nota_asal_id)  REFERENCES nota(id),
  FOREIGN KEY (nota_tukar_id) REFERENCES nota(id),
  FOREIGN KEY (user_id)       REFERENCES `user`(id),
  CHECK (nilai_retur = ke_hutang + ke_saldo + uang_kembali + untuk_tukar),
  CHECK (ada_pengecualian = 0 OR catatan IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE retur_item (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  retur_id      BIGINT NOT NULL,
  nota_item_id  BIGINT NOT NULL,
  varian_id     INT NOT NULL,                          -- warna WAJIB saat retur
  jumlah        DECIMAL(12,3) NOT NULL,                -- dalam satuan dasar
  kondisi       ENUM('baik','cacat') NOT NULL,         -- baik->stok, cacat->stok_rusak
  nilai_acuan   BIGINT NOT NULL,
  FOREIGN KEY (retur_id)     REFERENCES retur(id),
  FOREIGN KEY (nota_item_id) REFERENCES nota_item(id),
  FOREIGN KEY (varian_id)    REFERENCES varian(id),
  CHECK (jumlah > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pembayaran (
  id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
  nota_id            BIGINT NOT NULL,
  metode             ENUM('cash','qris','gopay','shopeepay','transfer',
                          'hutang','saldo','retur') NOT NULL,
  jumlah             BIGINT NOT NULL,
  status             ENUM('menunggu','diterima') NOT NULL,
  retur_id           BIGINT NULL,                      -- jika metode = retur (tukar barang)
  dibuat_pada        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- acuan peringatan 1 jam
  dikonfirmasi_oleh  INT NULL,
  dikonfirmasi_pada  DATETIME NULL,
  FOREIGN KEY (nota_id)           REFERENCES nota(id),
  FOREIGN KEY (retur_id)          REFERENCES retur(id),
  FOREIGN KEY (dikonfirmasi_oleh) REFERENCES `user`(id),
  CHECK (jumlah > 0),
  CHECK (metode <> 'retur' OR retur_id IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- BAGIAN 3 (lanjutan): HUTANG & SALDO TITIPAN
-- ---------------------------------------------------------------------
CREATE TABLE hutang (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  konsumen_id   INT NOT NULL,
  nota_id       BIGINT NOT NULL UNIQUE,                -- 1 nota = maksimal 1 hutang
  jumlah_awal   BIGINT NOT NULL,
  sisa          BIGINT NOT NULL,
  status        ENUM('belum_lunas','lunas') NOT NULL DEFAULT 'belum_lunas',
  dibuat_pada   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lunas_pada    DATETIME NULL,
  FOREIGN KEY (konsumen_id) REFERENCES konsumen(id),
  FOREIGN KEY (nota_id)     REFERENCES nota(id),
  INDEX idx_hutang_konsumen_status (konsumen_id, status, dibuat_pada),
  CHECK (sisa >= 0),                                   -- hutang tidak bisa minus
  CHECK (sisa <= jumlah_awal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE hutang_bayar (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  hutang_id  BIGINT NOT NULL,
  jumlah     BIGINT NOT NULL,
  cara       ENUM('bayar','retur') NOT NULL,
  nota_id    BIGINT NULL,                              -- nota tempat membayar
  retur_id   BIGINT NULL,
  user_id    INT NOT NULL,
  waktu      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hutang_id) REFERENCES hutang(id),
  FOREIGN KEY (nota_id)   REFERENCES nota(id),
  FOREIGN KEY (retur_id)  REFERENCES retur(id),
  FOREIGN KEY (user_id)   REFERENCES `user`(id),
  CHECK (jumlah > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE saldo_konsumen (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  konsumen_id  INT NOT NULL,
  jumlah       BIGINT NOT NULL,                        -- + titip, - dipakai/dikembalikan
  sumber       ENUM('retur','lebih_transfer','dipakai','transfer_balik','diikhlaskan') NOT NULL,
  nota_id      BIGINT NULL,
  retur_id     BIGINT NULL,
  catatan      VARCHAR(255) NULL,
  user_id      INT NOT NULL,
  waktu        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (konsumen_id) REFERENCES konsumen(id),
  FOREIGN KEY (nota_id)     REFERENCES nota(id),
  FOREIGN KEY (retur_id)    REFERENCES retur(id),
  FOREIGN KEY (user_id)     REFERENCES `user`(id),
  INDEX idx_saldo_konsumen (konsumen_id, waktu)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- BAGIAN 6 (lanjutan): UANG KELUAR, CEK SORE, HITUNG LACI
-- ---------------------------------------------------------------------
CREATE TABLE uang_keluar (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  dompet           ENUM('laci','receh','kulaan') NOT NULL,
  jumlah           BIGINT NOT NULL,
  keperluan        VARCHAR(255) NOT NULL,              -- jamu, GoSend, bayar supplier
  barang_masuk_id  BIGINT NULL,                        -- otomatis jika bayar supplier
  user_id          INT NOT NULL,
  waktu            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (barang_masuk_id) REFERENCES barang_masuk(id),
  FOREIGN KEY (user_id)         REFERENCES `user`(id),
  CHECK (jumlah > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cek_sore (
  id                        BIGINT AUTO_INCREMENT PRIMARY KEY,
  tanggal                   DATE NOT NULL UNIQUE,
  user_id                   INT NOT NULL,
  cash_masuk_sistem         BIGINT NOT NULL,           -- cash bersih hari ini menurut sistem
  uang_besar_dihitung       BIGINT NOT NULL,           -- lembar 50rb & 100rb (diketik staf)
  perkiraan_tambah_receh    BIGINT NOT NULL,           -- = cash_masuk_sistem - uang_besar_dihitung
  ewallet_sistem            BIGINT NOT NULL,
  ewallet_cocok             TINYINT(1) NOT NULL DEFAULT 0,
  total_pembulatan          BIGINT NOT NULL DEFAULT 0,
  catatan                   VARCHAR(500) NULL,
  waktu                     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES `user`(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE hitung_laci (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  tanggal           DATE NOT NULL,
  user_id           INT NOT NULL,
  perkiraan_sistem  BIGINT NULL,                       -- NULL pada hitungan pertama
  jumlah_fisik      BIGINT NOT NULL,
  selisih           BIGINT NULL,
  catatan           VARCHAR(500) NULL,
  waktu             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES `user`(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- DATA AWAL
-- ---------------------------------------------------------------------
INSERT INTO pengaturan (kunci, nilai) VALUES
  ('batas_hutang_tier_a',          '200000'),
  ('batas_hutang_tier_b',          '500000'),
  ('ambang_hutang_lama_tier_a',    '100000'),
  ('peringatan_ewallet_menit',     '60'),
  ('batas_retur_hari',             '7'),
  ('masa_saldo_hari',              '365'),
  ('batas_transfer_balik_saldo',   '10000'),
  ('template_pengingat_wa',
   'Assalamualaikum {nama}, mengingatkan hutang di Toko sebesar {jumlah} (nota {tanggal}). Terima kasih.');

INSERT INTO kategori (nama) VALUES
  ('Benang'), ('Benik'), ('Resleting'), ('Furing'), ('Kain');
