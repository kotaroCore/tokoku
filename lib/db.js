import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'data');
fs.mkdirSync(dir, { recursive: true });

const g = globalThis;
if (!g.__tokokuDb) {
  const db = new Database(path.join(dir, 'tokoku.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      started_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      ended_at TEXT
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      base_unit TEXT NOT NULL DEFAULT 'biji'
    );
    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      factor REAL NOT NULL DEFAULT 1,
      price REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      color TEXT NOT NULL DEFAULT '',
      stock REAL NOT NULL DEFAULT 0,
      level_green REAL NOT NULL DEFAULT 0,
      level_yellow REAL NOT NULL DEFAULT 0,
      level_red REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      phone TEXT,
      address TEXT,
      total_hutang REAL NOT NULL DEFAULT 0,
      last_hutang_date TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      shift_id INTEGER REFERENCES shifts(id),
      customer_id INTEGER REFERENCES customers(id),
      channel TEXT NOT NULL DEFAULT 'retail',
      total REAL NOT NULL,
      paid_cash REAL NOT NULL DEFAULT 0,
      paid_ewallet REAL NOT NULL DEFAULT 0,
      paid_transfer REAL NOT NULL DEFAULT 0,
      hutang REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      variant_id INTEGER NOT NULL REFERENCES variants(id),
      product_name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '',
      unit_name TEXT NOT NULL,
      qty REAL NOT NULL,
      factor REAL NOT NULL,
      unit_price REAL NOT NULL,
      discount_pct REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS debt_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id INTEGER NOT NULL REFERENCES variants(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      delta REAL NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);
  g.__tokokuDb = db;
}

export const db = g.__tokokuDb;
