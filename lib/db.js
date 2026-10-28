import mysql from 'mysql2/promise';

// Koneksi MySQL/MariaDB. Atur lewat .env.local (lihat .env.example).
const cfg = () => ({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
});
const DB_NAME = process.env.DB_NAME || 'tokoku';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS shifts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    base_unit VARCHAR(30) NOT NULL DEFAULT 'biji'
  )`,
  `CREATE TABLE IF NOT EXISTS units (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    name VARCHAR(50) NOT NULL,
    factor DOUBLE NOT NULL DEFAULT 1,
    price DECIMAL(14,2) NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS variants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    color VARCHAR(100) NOT NULL DEFAULT '',
    stock DOUBLE NOT NULL DEFAULT 0,
    level_green DOUBLE NOT NULL DEFAULT 0,
    level_yellow DOUBLE NOT NULL DEFAULT 0,
    level_red DOUBLE NOT NULL DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(191) NOT NULL UNIQUE,
    phone VARCHAR(30) NULL,
    address VARCHAR(255) NULL,
    total_hutang DECIMAL(14,2) NOT NULL DEFAULT 0,
    last_hutang_date DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
  )`,
  `CREATE TABLE IF NOT EXISTS sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    shift_id INT NULL,
    customer_id INT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'retail',
    total DECIMAL(14,2) NOT NULL,
    paid_cash DECIMAL(14,2) NOT NULL DEFAULT 0,
    paid_ewallet DECIMAL(14,2) NOT NULL DEFAULT 0,
    paid_transfer DECIMAL(14,2) NOT NULL DEFAULT 0,
    hutang DECIMAL(14,2) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (shift_id) REFERENCES shifts(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  )`,
  `CREATE TABLE IF NOT EXISTS sale_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_id INT NOT NULL,
    variant_id INT NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    color VARCHAR(100) NOT NULL DEFAULT '',
    unit_name VARCHAR(50) NOT NULL,
    qty DOUBLE NOT NULL,
    factor DOUBLE NOT NULL,
    unit_price DECIMAL(14,2) NOT NULL,
    discount_pct DOUBLE NOT NULL DEFAULT 0,
    subtotal DECIMAL(14,2) NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES variants(id)
  )`,
  `CREATE TABLE IF NOT EXISTS debt_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    user_id INT NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS stock_adjustments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    variant_id INT NOT NULL,
    user_id INT NOT NULL,
    delta DOUBLE NOT NULL,
    note VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (variant_id) REFERENCES variants(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS sale_returns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_id INT NOT NULL,
    user_id INT NOT NULL,
    shift_id INT NULL,
    total DECIMAL(14,2) NOT NULL,
    hutang_reduced DECIMAL(14,2) NOT NULL DEFAULT 0,
    refund_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    refund_method VARCHAR(20) NOT NULL DEFAULT 'cash',
    restock TINYINT(1) NOT NULL DEFAULT 1,
    note VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS sale_return_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    return_id INT NOT NULL,
    sale_item_id INT NOT NULL,
    qty DOUBLE NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    FOREIGN KEY (return_id) REFERENCES sale_returns(id) ON DELETE CASCADE,
    FOREIGN KEY (sale_item_id) REFERENCES sale_items(id)
  )`,
  `CREATE TABLE IF NOT EXISTS suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(191) NOT NULL UNIQUE,
    phone VARCHAR(30) NULL,
    address VARCHAR(255) NULL,
    note VARCHAR(255) NULL,
    active TINYINT(1) NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id INT NULL,
    user_id INT NOT NULL,
    shift_id INT NULL,
    total DECIMAL(14,2) NOT NULL,
    pay_method VARCHAR(20) NOT NULL DEFAULT 'cash',
    note VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS purchase_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_id INT NOT NULL,
    variant_id INT NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    color VARCHAR(100) NOT NULL DEFAULT '',
    unit_name VARCHAR(50) NOT NULL,
    qty DOUBLE NOT NULL,
    factor DOUBLE NOT NULL,
    unit_cost DECIMAL(14,2) NOT NULL,
    subtotal DECIMAL(14,2) NOT NULL,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES variants(id)
  )`,
  `CREATE TABLE IF NOT EXISTS purchase_shelf (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_item_id INT NOT NULL,
    variant_id INT NOT NULL,
    user_id INT NOT NULL,
    qty DOUBLE NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_item_id) REFERENCES purchase_items(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES variants(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS unit_presets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(30) NOT NULL UNIQUE,
    factor DOUBLE NULL
  )`,
  // Saldo titipan: setiap perubahan saldo pembeli (titip, dipakai bayar, refund retur).
  `CREATE TABLE IF NOT EXISTS saldo_mutasi (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    jumlah DECIMAL(14,2) NOT NULL,
    jenis VARCHAR(20) NOT NULL,
    sale_id INT NULL,
    return_id INT NULL,
    user_id INT NOT NULL,
    note VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  // Penomoran nota per hari (NT-YYYYMMDD-####). Satu baris per tanggal, dikunci saat dipakai.
  `CREATE TABLE IF NOT EXISTS nomor_nota (
    tanggal DATE PRIMARY KEY,
    terakhir INT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    k VARCHAR(50) PRIMARY KEY,
    v VARCHAR(500) NOT NULL
  )`,
  // Pesan untuk owner (pop-up): logout otomatis ditunda, hasil backup, dll.
  `CREATE TABLE IF NOT EXISTS notices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kind VARCHAR(20) NOT NULL DEFAULT 'info',
    message VARCHAR(500) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    seen TINYINT(1) NOT NULL DEFAULT 0
  )`,
];

// Kolom tambahan untuk database yang sudah ada (CREATE TABLE IF NOT EXISTS tidak menambah kolom).
const MIGRATIONS = [
  ['ALTER TABLE products ADD COLUMN cost DECIMAL(14,2) NOT NULL DEFAULT 0'],
  ['ALTER TABLE products ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1'],
  ['ALTER TABLE users ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1'],
  ['ALTER TABLE variants ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1'],
  // Langkah kedua hanya jalan sekali, saat kolom role baru dibuat: akun "owner" yang sudah ada jadi pemilik.
  ["ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'staff'", "UPDATE users SET role = 'owner' WHERE username = 'owner'"],
  ['ALTER TABLE purchases ADD COLUMN receipt_file VARCHAR(100) NULL'],
  // Nota supplier hanya mencatat produk; varian/warna baru ditentukan saat barang masuk rak.
  // Baris lama sudah punya varian, jadi dianggap sudah dirak seluruhnya.
  [
    'ALTER TABLE purchase_items ADD COLUMN product_id INT NULL',
    'UPDATE purchase_items pi JOIN variants v ON v.id = pi.variant_id SET pi.product_id = v.product_id',
  ],
  [
    'ALTER TABLE purchase_items ADD COLUMN shelved DOUBLE NOT NULL DEFAULT 0',
    'UPDATE purchase_items SET shelved = qty * factor WHERE variant_id IS NOT NULL',
  ],
  ['ALTER TABLE purchase_items MODIFY variant_id INT NULL'],
  // Baris penjualan yang warnanya diambil otomatis (kasir tidak memilih warna); dicek ulang saat cek sore.
  ['ALTER TABLE sale_items ADD COLUMN auto_pick TINYINT(1) NOT NULL DEFAULT 0'],
  ['ALTER TABLE sale_items ADD COLUMN auto_resolved TINYINT(1) NOT NULL DEFAULT 0'],
  // Satuan pilihan terkait satuan dasar produk; kosong = berlaku untuk semua satuan dasar.
  ["ALTER TABLE unit_presets ADD COLUMN base_unit VARCHAR(30) NOT NULL DEFAULT ''"],
  // Logout otomatis: aktivitas terakhir, penanda sedang transaksi, dan sesi yang mati karena diam (shift tetap berjalan).
  ['ALTER TABLE shifts ADD COLUMN last_active DATETIME NULL'],
  ['ALTER TABLE shifts ADD COLUMN busy_at DATETIME NULL'],
  ['ALTER TABLE shifts ADD COLUMN idle_out TINYINT(1) NOT NULL DEFAULT 0'],
  ['ALTER TABLE shifts ADD COLUMN busy_notified TINYINT(1) NOT NULL DEFAULT 0'],
  // Nota draf -> lunas / batal. Nota lama sudah terjadi, jadi dianggap lunas dan stoknya sudah berkurang.
  [
    'ALTER TABLE sales ADD COLUMN nomor VARCHAR(20) NULL, ADD UNIQUE KEY uq_sales_nomor (nomor), ADD COLUMN pay_old_debt DECIMAL(14,2) NOT NULL DEFAULT 0, ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT \'lunas\', ADD COLUMN alasan_batal VARCHAR(255) NULL, ADD COLUMN batal_oleh INT NULL, ADD COLUMN batal_pada DATETIME NULL',
  ],
  ['ALTER TABLE sale_items ADD COLUMN stok_dikurangi TINYINT(1) NOT NULL DEFAULT 1'],
  // Tier pembeli: dikenal staf (B) atau belum (A).
  ['ALTER TABLE customers ADD COLUMN dikenal TINYINT(1) NOT NULL DEFAULT 0'],
  // Retur: stok rusak terpisah dari stok jual; setiap perubahan stok dicatat dengan kolomnya (jual / rusak).
  ['ALTER TABLE variants ADD COLUMN stok_rusak DOUBLE NOT NULL DEFAULT 0'],
  ["ALTER TABLE stock_adjustments ADD COLUMN kolom VARCHAR(10) NOT NULL DEFAULT 'jual'"],
  ["ALTER TABLE sale_return_items ADD COLUMN kondisi VARCHAR(10) NOT NULL DEFAULT 'baik'"],
  // Pengecualian aturan retur yang dilewati staf (kode dipisah koma), wajib disertai catatan.
  ['ALTER TABLE sale_returns ADD COLUMN pengecualian VARCHAR(255) NULL'],
  // Saldo titipan, pembayaran dari saldo, dan tukar barang (nilai retur dipakai sebagai pembayaran nota baru).
  ['ALTER TABLE customers ADD COLUMN saldo DECIMAL(14,2) NOT NULL DEFAULT 0'],
  ['ALTER TABLE sales ADD COLUMN paid_saldo DECIMAL(14,2) NOT NULL DEFAULT 0, ADD COLUMN paid_tukar DECIMAL(14,2) NOT NULL DEFAULT 0'],
  ['ALTER TABLE sale_returns ADD COLUMN tukar_nota_id INT NULL'],
  // Hutang per nota: berapa yang sudah dibayar. Pembayaran dibagi ke nota tertua dulu.
  // Pembayaran lama (sebelum kolom ini) dibagi dengan urutan yang sama, sekali saja.
  [
    'ALTER TABLE sales ADD COLUMN hutang_terbayar DECIMAL(14,2) NOT NULL DEFAULT 0',
    `UPDATE sales s JOIN (
       SELECT x.id, LEAST(x.hutang, GREATEST(0, p.bayar - (x.kumulatif - x.hutang))) AS terbayar
       FROM (
         SELECT s2.id, s2.hutang, s2.customer_id,
           SUM(s2.hutang) OVER (PARTITION BY s2.customer_id ORDER BY s2.created_at, s2.id) AS kumulatif
         FROM sales s2 WHERE s2.status = 'lunas' AND s2.hutang > 0 AND s2.customer_id IS NOT NULL
       ) x
       JOIN (SELECT customer_id, SUM(amount) AS bayar FROM debt_payments GROUP BY customer_id) p ON p.customer_id = x.customer_id
     ) t ON t.id = s.id
     SET s.hutang_terbayar = t.terbayar`,
  ],
];

const g = globalThis;

function pool() {
  if (!g.__tokokuPool) {
    g.__tokokuPool = mysql.createPool({
      ...cfg(),
      database: DB_NAME,
      decimalNumbers: true,
      dateStrings: true,
      connectionLimit: 10,
    });
  }
  return g.__tokokuPool;
}

async function initSchema() {
  const admin = await mysql.createConnection(cfg());
  try {
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await admin.end();
  }
  const p = pool();
  for (const sql of SCHEMA) await p.query(sql + ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
  for (const [sql, after] of MIGRATIONS) {
    try {
      await p.query(sql);
    } catch (e) {
      if (e.errno === 1060) continue; // 1060 = kolom sudah ada
      throw e;
    }
    if (after) await p.query(after);
  }
}

export function ready() {
  if (!g.__tokokuReady) {
    g.__tokokuReady = initSchema().catch((e) => {
      g.__tokokuReady = null;
      throw e;
    });
  }
  return g.__tokokuReady;
}

// Query biasa. SELECT -> array baris; INSERT/UPDATE -> { insertId, affectedRows }.
export async function query(sql, params = []) {
  await ready();
  const [rows] = await pool().query(sql, params);
  return rows;
}

export async function queryOne(sql, params = []) {
  return (await query(sql, params))[0];
}

// Transaksi: fn menerima fungsi q(sql, params) yang berjalan di koneksi yang sama.
export async function tx(fn) {
  await ready();
  const conn = await pool().getConnection();
  try {
    await conn.beginTransaction();
    const q = async (sql, params = []) => (await conn.query(sql, params))[0];
    const result = await fn(q);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function closeDb() {
  if (g.__tokokuPool) await g.__tokokuPool.end();
}
