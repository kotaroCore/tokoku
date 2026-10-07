// Isi data awal: 3 user + contoh produk dari TOKO_PROJECT_PLAN_FINAL.md.
// Jalankan: npm run seed   (password awal bisa diatur lewat SEED_PASSWORD)
import bcrypt from 'bcryptjs';
import { query, tx, queryOne, closeDb } from '../lib/db.js'; // membuat database + tabel bila belum ada

const password = process.env.SEED_PASSWORD || 'tokoku123';
const hash = bcrypt.hashSync(password, 10);
for (const [username, name] of [['owner', 'Owner'], ['kasir', 'Kasir'], ['gudang', 'Gudang']]) {
  await query('INSERT IGNORE INTO users (username, name, password_hash) VALUES (?, ?, ?)', [username, name, hash]);
}

const { n } = await queryOne('SELECT COUNT(*) AS n FROM products');
if (n === 0) {
  await tx(async (q) => {
    const addProduct = async (category, name, base_unit, units, variants) => {
      const p = await q('INSERT INTO products (category, name, base_unit) VALUES (?, ?, ?)', [category, name, base_unit]);
      for (const [uname, factor, price] of units) {
        await q('INSERT INTO units (product_id, name, factor, price) VALUES (?, ?, ?, ?)', [p.insertId, uname, factor, price]);
      }
      for (const [color, stock, g, y, r] of variants) {
        await q(
          'INSERT INTO variants (product_id, color, stock, level_green, level_yellow, level_red) VALUES (?, ?, ?, ?, ?, ?)',
          [p.insertId, color, stock, g || 0, y || 0, r || 0]
        );
      }
    };
    // Benang: stok dalam biji, level reorder dalam biji (12 dosin = 144 biji)
    const benangWarna = [['Hitam', 600, 144, 108, 72], ['Putih', 480, 144, 108, 72], ['Natural', 300, 144, 108, 72], ['111', 80, 72, 48, 24], ['110', 72, 72, 48, 24], ['077', 24, 72, 48, 24]];
    const besar = benangWarna.map(([c, s, g, y, r]) => [c, s / 6, g / 6, y / 6, r / 6]);
    await addProduct('BENANG', 'Benang Jahit Yamalaon Kecil', 'biji', [['biji', 1, 2000], ['dosin', 12, 21500]], benangWarna);
    await addProduct('BENANG', 'Benang Jahit Yamalaon Besar', 'biji', [['biji', 1, 18000], ['0,5 dosin', 6, 105000]], besar);
    await addProduct('BENANG', 'Benang Jahit Tambang Kecil', 'biji', [['biji', 1, 2500], ['dosin', 12, 28000]], benangWarna);
    await addProduct('BENANG', 'Benang Jahit Tambang Besar', 'biji', [['biji', 1, 21000], ['0,5 dosin', 6, 125000]], besar);
    // Meteran: stok dalam meter
    await addProduct('FURING', 'Furing', 'meter', [['meter', 1, 14000]], [['Hitam', 100, 50, 30, 15], ['SD', 80], ['Dongker', 60]]);
    await addProduct('KAIN', 'Kain Erro Tipis', 'meter', [['meter', 1, 16000]], [['Hitam', 50], ['Putih', 50]]);
    await addProduct('KAIN', 'Kain Erro Tebal', 'meter', [['meter', 1, 21000]], [['Hitam', 50], ['Putih', 50]]);
    await addProduct('KAIN', 'Kain Chang', 'meter', [['meter', 1, 10000]], [['Hitam', 50], ['Putih', 50]]);
    await addProduct('RESLETING', 'Resleting 20cm', 'buah', [['buah', 1, 10000]], [['Hitam', 100], ['Gold', 50]]);
    await addProduct('RESLETING', 'Resleting Meteran', 'meter', [['meter', 1, 8000]], [['Hitam', 50]]);
    await addProduct('BENIK', 'Benik Ceplis Logam 15mm', 'biji', [['biji', 1, 500]], [['Hitam', 500], ['Gold', 300]]);
    await addProduct('BENIK', 'Benik Lubang 2', 'biji', [['biji', 1, 1000], ['gross', 144, 5500], ['mass', 1440, 55000]], [['Hitam', 2000], ['002P', 1500]]);
    await addProduct('BENIK', 'Benik Jeans Tetap Tipis', 'biji', [['biji', 1, 500], ['dosin', 12, 4500]], [['', 1000]]);
    await addProduct('BENIK', 'Benik Jeans Tetap Tebal', 'biji', [['biji', 1, 1000]], [['', 500]]);
    // Benik jeglok: 3 cara jual per ukuran. Contoh ukuran 18mm.
    await addProduct('BENIK', 'Benik Jeglok 18mm - Paket Plastik', 'paket', [['paket', 1, 28000]], [['', 10]]);
    await addProduct('BENIK', 'Benik Jeglok 18mm - Dosin', 'biji', [['dosin', 12, 1500]], [['', 240]]);
    await addProduct('BENIK', 'Benik Jeglok 18mm - Isi+Jasa', 'biji', [['biji', 1, 350]], [['', 500]]);
  });
}

console.log('Seed selesai. User: owner / kasir / gudang, password awal:', password);
await closeDb();
