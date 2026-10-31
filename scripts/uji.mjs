// Uji otomatis logika toko terhadap database uji terpisah (dibuat ulang setiap kali jalan).
// Pakai: npm run uji   (database: tokoku_uji, atau DB_NAME lain yang berakhiran _uji)
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';

process.env.DB_NAME = process.env.DB_NAME_UJI || 'tokoku_uji';
const DB = process.env.DB_NAME;
if (!/_uji$/.test(DB)) throw new Error(`Database uji harus berakhiran _uji (sekarang ${DB}); database toko tidak boleh dikosongkan.`);

// Kosongkan database uji sebelum lib/db.js membuat skema.
const admin = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
});
await admin.query(`DROP DATABASE IF EXISTS \`${DB}\``);
await admin.end();

const { query, queryOne, tx, closeDb } = await import('../lib/db.js');
const { BadRequest, buatNota, lunasiNota, batalkanNota, bayarHutang, tambahSaldo } = await import('../lib/sales.js');
const { prosesRetur } = await import('../lib/returns.js');
const { catatPembelian, ubahStatusPembelian, masukRak } = await import('../lib/purchases.js');
const { koreksiStok, cekSoreAlokasi, isiStokAwal } = await import('../lib/stok.js');
const { ubahProduk } = await import('../lib/produk.js');
const { buangRusak, buatReturSupplier, selesaikanReturSupplier } = await import('../lib/rusak.js');
const { NamaMirip, namaMirip, teksPengingat } = await import('../lib/pembeli.js');
const { Forbidden } = await import('../lib/izin.js');
const { saldoDompet } = await import('../lib/dompet.js');

after(closeDb);

// ---------- data uji ----------
const ADMIN = (await query("INSERT INTO users (username, name, password_hash, role) VALUES ('admin', 'Admin', '-', 'admin')")).insertId;
const STAF = (await query("INSERT INTO users (username, name, password_hash, role) VALUES ('staf', 'Staf', '-', 'staff')")).insertId;

let nProduk = 0;
// Produk dengan satuan biji (Rp 1.000) dan dosin (12 biji, Rp 10.000), dan beberapa warna dengan stok awal.
async function produk({ stok = [100], cost = 500, category = 'BENANG' } = {}) {
  const pid = (await query('INSERT INTO products (category, name, base_unit, cost) VALUES (?, ?, ?, ?)', [category, `Produk uji ${++nProduk}`, 'biji', cost])).insertId;
  const biji = (await query("INSERT INTO units (product_id, name, factor, price) VALUES (?, 'biji', 1, 1000)", [pid])).insertId;
  const dosin = (await query("INSERT INTO units (product_id, name, factor, price) VALUES (?, 'dosin', 12, 10000)", [pid])).insertId;
  const warna = [];
  for (const [i, s] of stok.entries()) {
    warna.push((await query('INSERT INTO variants (product_id, color, stock) VALUES (?, ?, ?)', [pid, `W${i + 1}`, s])).insertId);
  }
  return { pid, biji, dosin, warna };
}

const nota = (b) => tx((q) => buatNota(q, {
  userId: STAF, shiftId: null, channel: 'retail', paidCash: 0, paidEwallet: 0, paidTransfer: 0, payDebt: 0, ...b,
}));
const lunasi = (id) => tx((q) => lunasiNota(q, id, STAF));
const notaLunas = async (b) => { const n = await nota(b); await lunasi(n.saleId); return n; };
const stok = async (vid) => (await queryOne('SELECT stock FROM variants WHERE id = ?', [vid])).stock;
const rusak = async (vid) => (await queryOne('SELECT stok_rusak FROM variants WHERE id = ?', [vid])).stok_rusak;
const pembeli = (name) => queryOne('SELECT * FROM customers WHERE name = ?', [name]);
const dompet = (d) => tx((q) => saldoDompet(q, d));
const sesiAdmin = { uid: ADMIN, role: 'admin', izin: [] };
const sesiStaf = (izin = []) => ({ uid: STAF, role: 'staff', izin });
const tanpaIzin = (p) => assert.rejects(p, (e) => e instanceof Forbidden);
const ditolak = (p, pola) => assert.rejects(p, (e) => e instanceof BadRequest && (!pola || pola.test(e.message)));

// ---------- skenario ----------

test('Nota draf lalu lunas: stok berkurang hanya saat lunas, nomor berurutan per hari', async () => {
  const p = await produk({ stok: [50] });
  const a = await nota({ items: [{ variant_id: p.warna[0], unit_id: p.biji, qty: 5 }], paidCash: 5000 });
  assert.equal(await stok(p.warna[0]), 50);
  const b = await nota({ items: [{ variant_id: p.warna[0], unit_id: p.biji, qty: 1 }], paidCash: 1000 });
  assert.match(a.nomor, /^NT-\d{8}-\d{4}$/);
  assert.equal(Number(b.nomor.slice(-4)), Number(a.nomor.slice(-4)) + 1);
  assert.equal(a.nomor.slice(0, 11), b.nomor.slice(0, 11));
  await lunasi(a.saleId);
  assert.equal(await stok(p.warna[0]), 45);
  const s = await queryOne('SELECT status FROM sales WHERE id = ?', [a.saleId]);
  assert.equal(s.status, 'lunas');
  await ditolak(lunasi(a.saleId), /sudah lunas/);
});

test('Nota dibatalkan: stok, hutang, saldo, dan dompet kembali seperti semula', async () => {
  const p = await produk({ stok: [30] });
  await tx((q) => q("INSERT INTO customers (name, dikenal) VALUES ('Batal Uji', 1)"));
  const c0 = await pembeli('Batal Uji');
  await tx((q) => tambahSaldo(q, c0.id, 2000, STAF, { jenis: 'titip' }));
  const awal = { stok: await stok(p.warna[0]), c: await pembeli('Batal Uji'), laci: await dompet('laci'), receh: await dompet('receh') };
  const n = await nota({ items: [{ variant_id: p.warna[0], unit_id: p.biji, qty: 10 }], customerName: 'Batal Uji', paidCash: 3000, paidSaldo: 2000 });
  await tx((q) => batalkanNota(q, n.saleId, STAF, 'uji batal'));
  const c = await pembeli('Batal Uji');
  assert.equal(await stok(p.warna[0]), awal.stok);
  assert.equal(c.total_hutang, awal.c.total_hutang);
  assert.equal(c.saldo, awal.c.saldo);
  assert.equal(await dompet('laci'), awal.laci);
  assert.equal(await dompet('receh'), awal.receh);
  assert.equal((await queryOne('SELECT status FROM sales WHERE id = ?', [n.saleId])).status, 'batal');
  // Nota lunas tidak bisa dibatalkan (koreksinya lewat retur), dan alasan wajib.
  const l = await notaLunas({ items: [{ variant_id: p.warna[0], unit_id: p.biji, qty: 1 }], paidCash: 1000 });
  await ditolak(tx((q) => batalkanNota(q, l.saleId, STAF, 'coba')), /draf/);
  const d = await nota({ items: [{ variant_id: p.warna[0], unit_id: p.biji, qty: 1 }], paidCash: 1000 });
  await ditolak(tx((q) => batalkanNota(q, d.saleId, STAF, '  ')), /Alasan/);
});

test('Dua kasir menyimpan bersamaan: nomor nota tidak kembar', async () => {
  const p = await produk({ stok: [100] });
  const hasil = await Promise.all(Array.from({ length: 6 }, () => nota({ items: [{ variant_id: p.warna[0], unit_id: p.biji, qty: 1 }], paidCash: 1000 })));
  assert.equal(new Set(hasil.map((h) => h.nomor)).size, 6);
});

test('Pembayaran campuran: cash, e-wallet, transfer, saldo, dan hutang berjumlah sama dengan tagihan', async () => {
  const p = await produk({ stok: [100] });
  await tx((q) => q("INSERT INTO customers (name) VALUES ('Campur Uji')"));
  const c = await pembeli('Campur Uji');
  await tx((q) => tambahSaldo(q, c.id, 1500, STAF, { jenis: 'titip' }));
  const laci = await dompet('laci');
  const n = await nota({
    items: [{ variant_id: p.warna[0], unit_id: p.biji, qty: 10 }], customerName: 'Campur Uji',
    paidCash: 2000, paidEwallet: 2000, paidEwalletKet: 'QRIS', paidTransfer: 2000, paidSaldo: 1500, pembulatan: -500,
  });
  assert.equal(n.menunggu, true); // e-wallet / transfer menunggu konfirmasi, nota tetap draf
  await lunasi(n.saleId);
  const s = await queryOne('SELECT * FROM sales WHERE id = ?', [n.saleId]);
  assert.equal(s.paid_cash + s.paid_ewallet + s.paid_transfer + s.paid_saldo + s.paid_tukar + s.hutang, s.total + s.pembulatan);
  assert.equal(s.hutang, 2000);
  const c2 = await pembeli('Campur Uji');
  assert.equal(c2.saldo, 0);
  assert.equal(c2.total_hutang, 2000);
  assert.equal(await dompet('laci'), laci + 2000);
  // E-wallet tanpa keterangan ditolak.
  await ditolak(nota({ items: [{ variant_id: p.warna[0], unit_id: p.biji, qty: 1 }], paidEwallet: 1000 }), /keterangan/);
});

test('Hutang tier A dan B: batas Rp 200.000 dan Rp 500.000, hutang lama tier A', async () => {
  const p = await produk({ stok: [5000] });
  const item = (qty) => [{ variant_id: p.warna[0], unit_id: p.biji, qty }];
  // Tanpa nama tidak boleh berhutang.
  await ditolak(nota({ items: item(1) }), /Nama pembeli/);
  // Tier A: maks Rp 200.000 per nota.
  await ditolak(nota({ items: item(201), customerName: 'Tier A Uji' }), /200\.000/);
  await notaLunas({ items: item(150), customerName: 'Tier A Uji' });
  // Hutang lama Rp 150.000 (>= Rp 100.000): hutang baru ditolak sampai dilunasi.
  await ditolak(nota({ items: item(1), customerName: 'Tier A Uji' }), /dilunasi dulu/);
  // Bayar hutang lama sampai sisa < Rp 100.000 di nota yang sama: boleh.
  await notaLunas({ items: item(10), customerName: 'Tier A Uji', paidCash: 60000, payDebt: 60000 });
  assert.equal((await pembeli('Tier A Uji')).total_hutang, 100000);
  // Tier B (dikenal): maks Rp 500.000 per nota, hutang lama tidak menghalangi.
  await query("UPDATE customers SET dikenal = 1 WHERE name = 'Tier A Uji'");
  await ditolak(nota({ items: item(501), customerName: 'Tier A Uji' }), /500\.000/);
  await notaLunas({ items: item(500), customerName: 'Tier A Uji' });
  assert.equal((await pembeli('Tier A Uji')).total_hutang, 600000);
});

test('Bayar hutang lama: dibagi ke nota tertua dulu', async () => {
  const p = await produk({ stok: [100] });
  await tx((q) => q("INSERT INTO customers (name, dikenal) VALUES ('Urut Uji', 1)"));
  const ids = [];
  for (const qty of [1, 2, 3]) ids.push((await notaLunas({ items: [{ variant_id: p.warna[0], unit_id: p.biji, qty }], customerName: 'Urut Uji' })).saleId);
  const c = await pembeli('Urut Uji');
  assert.equal(c.total_hutang, 6000);
  await tx((q) => bayarHutang(q, c.id, 2500, STAF));
  const rows = await query('SELECT id, hutang_terbayar FROM sales WHERE id IN (?) ORDER BY id', [ids]);
  assert.deepEqual(rows.map((r) => r.hutang_terbayar), [1000, 1500, 0]);
  assert.equal((await pembeli('Urut Uji')).total_hutang, 3500);
});

test('Retur sebagian: tidak melebihi yang dibeli, potong hutang dulu, barang cacat ke stok rusak', async () => {
  const p = await produk({ stok: [100] });
  const v = p.warna[0];
  const n = await notaLunas({ items: [{ variant_id: v, unit_id: p.biji, qty: 10 }], customerName: 'Retur Uji', paidCash: 4000 });
  const it = await queryOne('SELECT id FROM sale_items WHERE sale_id = ?', [n.saleId]);
  const retur = (qty, kondisi = 'baik') => tx((q) => prosesRetur(q, { userId: STAF }, { sale_id: n.saleId, items: [{ sale_item_id: it.id, qty, kondisi }] }));
  const r1 = await retur(3);
  assert.equal(r1.total, 3000);
  assert.equal(r1.hutangReduced, 3000);
  assert.equal(r1.refund, 0);
  assert.equal(await stok(v), 93);
  await ditolak(retur(8), /melebihi/);
  const r2 = await retur(2, 'cacat');
  assert.equal(r2.hutangReduced, 2000);
  assert.equal(await stok(v), 93);
  assert.equal(await rusak(v), 2);
  const laci = await dompet('laci');
  const r3 = await retur(5);
  assert.equal(r3.hutangReduced, 1000);
  assert.equal(r3.refund, 4000);
  assert.equal(await dompet('laci'), laci - 4000);
  assert.equal((await pembeli('Retur Uji')).total_hutang, 0);
  await ditolak(retur(1), /melebihi/);
});

test('Tukar barang: nilai retur menjadi pembayaran nota baru', async () => {
  const p = await produk({ stok: [100] });
  const v = p.warna[0];
  const n = await notaLunas({ items: [{ variant_id: v, unit_id: p.biji, qty: 3 }], paidCash: 3000 });
  const it = await queryOne('SELECT id FROM sale_items WHERE sale_id = ?', [n.saleId]);
  const r = await tx((q) => prosesRetur(q, { userId: STAF }, {
    sale_id: n.saleId, items: [{ sale_item_id: it.id, qty: 2 }], tukar: [{ variant_id: v, unit_id: p.dosin, qty: 1 }], paid_cash: 8000,
  }));
  assert.equal(r.refund, 0);
  const baru = await queryOne('SELECT * FROM sales WHERE id = ?', [r.tukarNota.saleId]);
  assert.equal(baru.status, 'lunas');
  assert.equal(baru.paid_tukar, 2000);
  assert.equal(baru.paid_tukar + baru.paid_cash, baru.total);
  assert.equal(await stok(v), 100 - 3 + 2 - 12);
});

test('Barang masuk dicicil ke rak: stok bertambah per warna, status hilang tidak menambah stok', async () => {
  const p = await produk({ stok: [0, 0] });
  const [a, b] = p.warna;
  const sesi = { userId: STAF, isAdmin: false, bolehModal: false };
  const beli = await tx((q) => catatPembelian(q, sesi, { status: 'dalam_perjalanan', items: [{ product_id: p.pid, unit_name: 'gross', factor: 144, qty: 1, unit_cost: 72000 }] }));
  const item = await queryOne('SELECT * FROM purchase_items WHERE purchase_id = ?', [beli.id]);
  await ditolak(tx((q) => masukRak(q, beli.id, item.id, [{ variant_id: a, qty: 1 }], STAF)), /belum diterima/);
  await tx((q) => ubahStatusPembelian(q, beli.id, 'diterima', sesi));
  await tx((q) => masukRak(q, beli.id, item.id, [{ variant_id: a, qty: 6, factor: 12 }], STAF));
  assert.equal(await stok(a), 72);
  await tx((q) => masukRak(q, beli.id, item.id, [{ variant_id: b, qty: 5, factor: 12 }], STAF));
  assert.equal(await stok(b), 60);
  await ditolak(tx((q) => masukRak(q, beli.id, item.id, [{ variant_id: b, qty: 2, factor: 12 }], STAF)), /Melebihi/);
  await tx((q) => masukRak(q, beli.id, item.id, [{ variant_id: b, qty: 1, factor: 12 }], STAF));
  assert.equal((await queryOne('SELECT shelved FROM purchase_items WHERE id = ?', [item.id])).shelved, 144);
  // Harga beli per biji diperbarui saat diterima (72.000 / 144 = 500).
  assert.equal((await queryOne('SELECT cost FROM products WHERE id = ?', [p.pid])).cost, 500);

  const hilang = await tx((q) => catatPembelian(q, sesi, { status: 'dalam_perjalanan', items: [{ product_id: p.pid, unit_name: 'dosin', factor: 12, qty: 2, unit_cost: 6000 }] }));
  await tx((q) => ubahStatusPembelian(q, hilang.id, 'hilang', sesi));
  const ih = await queryOne('SELECT * FROM purchase_items WHERE purchase_id = ?', [hilang.id]);
  await ditolak(tx((q) => masukRak(q, hilang.id, ih.id, [{ variant_id: a, qty: 1 }], STAF)), /belum diterima/);
  await ditolak(tx((q) => ubahStatusPembelian(q, hilang.id, 'diterima', sesi)), /sudah hilang/);
  assert.equal(await stok(a), 72);
});

test('Stok tidak minus: penjualan, koreksi, dan cek sore menolak stok di bawah nol', async () => {
  const p = await produk({ stok: [5, 3] });
  const [a, b] = p.warna;
  // Penjualan: draf dibuat saat stok cukup, lalu stok berkurang sebelum dilunasi.
  await ditolak(nota({ items: [{ variant_id: a, unit_id: p.biji, qty: 6 }], paidCash: 6000 }), /tidak cukup/);
  const d = await nota({ items: [{ variant_id: a, unit_id: p.biji, qty: 4 }], paidCash: 4000 });
  await tx((q) => koreksiStok(q, { variantId: a, userId: STAF, delta: -2, note: 'hilang' }));
  await ditolak(lunasi(d.saleId), /tidak cukup/);
  assert.equal(await stok(a), 3);
  // Koreksi: alasan wajib, dan tidak boleh di bawah nol.
  await ditolak(tx((q) => koreksiStok(q, { variantId: a, userId: STAF, delta: -1, note: '' })), /Alasan/);
  await ditolak(tx((q) => koreksiStok(q, { variantId: a, userId: STAF, delta: -4, note: 'salah hitung' })), /minus/);
  // Cek sore: warna yang dipilih tidak boleh melebihi stoknya.
  await notaLunas({ items: [{ variant_id: a, unit_id: p.biji, qty: 2, auto: true }], paidCash: 2000 });
  assert.equal(await stok(a), 1);
  await ditolak(tx((q) => cekSoreAlokasi(q, { productId: p.pid, userId: STAF, allocations: [{ variant_id: b, qty: 4 }] })), /harus sama/);
  await tx((q) => q('UPDATE variants SET stock = 1 WHERE id = ?', [b]));
  await ditolak(tx((q) => cekSoreAlokasi(q, { productId: p.pid, userId: STAF, allocations: [{ variant_id: b, qty: 2 }] })), /tidak cukup/);
  await tx((q) => cekSoreAlokasi(q, { productId: p.pid, userId: STAF, allocations: [{ variant_id: a, qty: 1 }, { variant_id: b, qty: 1 }] }));
  assert.equal(await stok(a), 2);
  assert.equal(await stok(b), 0);
  const { n } = await queryOne('SELECT COUNT(*) AS n FROM variants WHERE stock < 0 OR stok_rusak < 0');
  assert.equal(n, 0);
});

test('Ubah harga oleh staf: ditolak (403) kecuali staf punya izin admin; perubahan tercatat', async () => {
  const p = await produk();
  const units = await query('SELECT * FROM units WHERE product_id = ? ORDER BY id', [p.pid]);
  const cur = await queryOne('SELECT * FROM products WHERE id = ?', [p.pid]);
  const body = (ubah = {}) => ({
    id: p.pid, category: cur.category, name: cur.name, base_unit: cur.base_unit, cost: cur.cost,
    units: units.map((u) => ({ id: u.id, name: u.name, factor: u.factor, price: u.price })), ...ubah,
  });
  const hargaBaru = body({ units: units.map((u) => ({ id: u.id, name: u.name, factor: u.factor, price: u.price + 500 })) });
  await tanpaIzin(tx((q) => ubahProduk(q, sesiStaf(), hargaBaru)));
  await tanpaIzin(tx((q) => ubahProduk(q, sesiStaf(['ubah_harga']), body({ cost: 700 }))));
  // Menghapus satuan juga butuh izin harga.
  await tanpaIzin(tx((q) => ubahProduk(q, sesiStaf(), body({ units: [units[0]] }))));
  // Staf tanpa izin tetap boleh menambah satuan baru dan mengganti nama produk.
  await tx((q) => ubahProduk(q, sesiStaf(), body({ name: cur.name + ' baru', units: [...body().units, { name: 'gross', factor: 144, price: 100000 }] })));
  assert.equal((await query('SELECT * FROM units WHERE product_id = ?', [p.pid])).length, 3);
  const gross = await query("SELECT id, name, factor, price FROM units WHERE product_id = ? AND name = 'gross'", [p.pid]);
  await tx((q) => ubahProduk(q, sesiStaf(['ubah_harga']), { ...hargaBaru, name: cur.name + ' baru', units: [...hargaBaru.units, ...gross] }));
  assert.equal((await queryOne('SELECT price FROM units WHERE id = ?', [units[0].id])).price, 1500);
  const semua = await query('SELECT id, name, factor, price FROM units WHERE product_id = ?', [p.pid]);
  await tx((q) => ubahProduk(q, sesiAdmin, { ...body({ cost: 650 }), name: cur.name + ' baru', units: semua }));
  assert.equal((await queryOne('SELECT cost FROM products WHERE id = ?', [p.pid])).cost, 650);
  const log = await query("SELECT * FROM catatan_perubahan WHERE objek = 'satuan' AND objek_id = ?", [units[0].id]);
  assert.equal(log.length, 1);
  assert.deepEqual([JSON.parse(log[0].lama).price, JSON.parse(log[0].baru).price], [1000, 1500]);
  const modal = await queryOne("SELECT * FROM catatan_perubahan WHERE objek = 'produk' AND objek_id = ? AND baru LIKE '%cost%'", [p.pid]);
  assert.equal(JSON.parse(modal.baru).cost, 650);
});

test('Barang masuk oleh staf tanpa izin modal: harga beli produk tidak berubah sampai admin memutuskan', async () => {
  const p = await produk({ cost: 500 });
  const beli = (sesi) => tx((q) => catatPembelian(q, sesi, { items: [{ product_id: p.pid, unit_name: 'dosin', factor: 12, qty: 1, unit_cost: 7200 }] }));
  await beli({ userId: STAF, isAdmin: false, bolehModal: false });
  assert.equal((await queryOne('SELECT cost FROM products WHERE id = ?', [p.pid])).cost, 500);
  const h = await queryOne('SELECT * FROM harga_alert WHERE product_id = ?', [p.pid]);
  assert.equal(h.modal_diubah, 0);
  assert.equal(Number(h.baru), 600);
  await beli({ userId: STAF, isAdmin: false, bolehModal: true });
  assert.equal((await queryOne('SELECT cost FROM products WHERE id = ?', [p.pid])).cost, 600);
});

test('Koreksi stok tercatat di catatan perubahan dengan nilai lama dan baru', async () => {
  const p = await produk({ stok: [10] });
  await tx((q) => koreksiStok(q, { variantId: p.warna[0], userId: STAF, delta: -3, note: 'salah hitung' }));
  const c = await queryOne("SELECT * FROM catatan_perubahan WHERE objek = 'stok' AND objek_id = ?", [p.warna[0]]);
  assert.deepEqual(JSON.parse(c.lama), { stock: 10 });
  assert.deepEqual(JSON.parse(c.baru), { stock: 7, alasan: 'salah hitung' });
  assert.equal(c.user_id, STAF);
});

test('Jual barang rusak: stok rusak berkurang saat lunas, stok jual tetap; retur kembali ke stok rusak', async () => {
  const p = await produk({ stok: [20, 20] });
  const [a, b] = p.warna;
  await query('UPDATE variants SET stok_rusak = 3 WHERE id = ?', [a]);
  await query('UPDATE variants SET stok_rusak = 5 WHERE id = ?', [b]);
  await ditolak(nota({ items: [{ variant_id: b, unit_id: p.biji, qty: 6, dari_rusak: 1, harga: 200 }], paidCash: 1200 }), /rusak/);
  const n = await nota({ items: [{ variant_id: b, unit_id: p.biji, qty: 4, dari_rusak: 1, harga: 250 }], paidCash: 1000 });
  assert.equal(await rusak(b), 5);
  await lunasi(n.saleId);
  assert.equal(await rusak(b), 1);
  assert.equal(await stok(b), 20);
  const it = await queryOne('SELECT * FROM sale_items WHERE sale_id = ?', [n.saleId]);
  assert.equal(it.dari_rusak, 1);
  assert.equal(it.subtotal, 1000);
  await tx((q) => prosesRetur(q, { userId: STAF }, { sale_id: n.saleId, items: [{ sale_item_id: it.id, qty: 1 }] }));
  assert.equal(await rusak(b), 2);
  assert.equal(await stok(b), 20);
});

test('Buang stok rusak oleh staf: ditolak kecuali punya izin; nilai dicatat sebagai kerugian', async () => {
  const p = await produk({ stok: [10], cost: 400 });
  const v = p.warna[0];
  await query('UPDATE variants SET stok_rusak = 5 WHERE id = ?', [v]);
  await tanpaIzin(tx((q) => buangRusak(q, sesiStaf(), { variantId: v, qty: 1, alasan: 'sobek' })));
  await ditolak(tx((q) => buangRusak(q, sesiStaf(['buang_rusak']), { variantId: v, qty: 1, alasan: '' })), /Alasan/);
  await ditolak(tx((q) => buangRusak(q, sesiAdmin, { variantId: v, qty: 6, alasan: 'sobek' })), /tidak cukup/);
  const r = await tx((q) => buangRusak(q, sesiStaf(['buang_rusak']), { variantId: v, qty: 2, alasan: 'sobek' }));
  assert.equal(r.nilai, 800);
  assert.equal(await rusak(v), 3);
  assert.equal(await stok(v), 10);
  const adj = await queryOne("SELECT * FROM stock_adjustments WHERE variant_id = ? AND jenis = 'buang'", [v]);
  assert.equal(adj.nilai, 800);
  assert.equal(adj.kolom, 'rusak');
});

test('Retur ke supplier: dikirim, ditolak, diuangkan, dan diganti lewat barang masuk Rp 0', async () => {
  const p = await produk({ stok: [10, 10], cost: 500 });
  const [a, b] = p.warna;
  await query('UPDATE variants SET stok_rusak = 6 WHERE id IN (?)', [[a, b]]);
  const sup = (await query("INSERT INTO suppliers (name) VALUES ('Supplier Uji')")).insertId;
  const kirim = (items) => tx((q) => buatReturSupplier(q, sesiStaf(), { supplier_id: sup, items }));
  const selesai = (id, status, uang) => tx((q) => selesaikanReturSupplier(q, sesiStaf(), id, { status, uang }));

  const r1 = await kirim([{ variant_id: a, qty: 2 }]);
  assert.equal(r1.nilai, 1000);
  assert.equal(await rusak(a), 4);
  await selesai(r1.id, 'ditolak');
  assert.equal(await rusak(a), 6);
  await ditolak(selesai(r1.id, 'diuangkan'), /sudah ditolak/);

  const kulakan = await dompet('kulakan');
  const r2 = await kirim([{ variant_id: a, qty: 1 }, { variant_id: b, qty: 1 }]);
  await selesai(r2.id, 'diuangkan', 900);
  assert.equal(await dompet('kulakan'), kulakan + 900);

  const r3 = await kirim([{ variant_id: b, qty: 3 }]);
  const g = await selesai(r3.id, 'diganti');
  const pu = await queryOne('SELECT * FROM purchases WHERE id = ?', [g.purchaseId]);
  assert.equal(pu.total, 0);
  assert.equal(pu.retur_supplier_id, r3.id);
  const item = await queryOne('SELECT * FROM purchase_items WHERE purchase_id = ?', [pu.id]);
  await tx((q) => masukRak(q, pu.id, item.id, [{ variant_id: b, qty: 3 }], STAF));
  assert.equal(await stok(b), 13);
  assert.equal(await rusak(b), 2);
  assert.equal(await stok(a), 10);
});

test('Jatuh tempo: bawaan H+7 saat lunas, atau tanggal pilihan kasir', async () => {
  const p = await produk({ stok: [100] });
  const a = await notaLunas({ items: [{ variant_id: p.warna[0], unit_id: p.biji, qty: 2 }], customerName: 'Tempo Uji' });
  const s = await queryOne('SELECT jatuh_tempo, DATE(created_at) + INTERVAL 7 DAY AS h7 FROM sales WHERE id = ?', [a.saleId]);
  assert.equal(s.jatuh_tempo, s.h7);
  const besok = (await queryOne('SELECT CURDATE() + INTERVAL 3 DAY AS d')).d;
  const b = await notaLunas({ items: [{ variant_id: p.warna[0], unit_id: p.biji, qty: 1 }], customerName: 'Tempo Uji', paidCash: 0, payDebt: 0, jatuhTempo: besok });
  assert.equal((await queryOne('SELECT jatuh_tempo FROM sales WHERE id = ?', [b.saleId])).jatuh_tempo, besok);
  const kemarin = (await queryOne('SELECT CURDATE() - INTERVAL 1 DAY AS d')).d;
  await ditolak(nota({ items: [{ variant_id: p.warna[0], unit_id: p.biji, qty: 1 }], customerName: 'Tempo Uji', jatuhTempo: kemarin }), /sebelum hari ini/);
  // Nota tanpa hutang tidak punya jatuh tempo.
  const c = await notaLunas({ items: [{ variant_id: p.warna[0], unit_id: p.biji, qty: 1 }], paidCash: 1000 });
  assert.equal((await queryOne('SELECT jatuh_tempo FROM sales WHERE id = ?', [c.saleId])).jatuh_tempo, null);
});

test('Nama mirip: pembeli baru dengan nama mirip memunculkan pilihan, tetap boleh dibuat baru', async () => {
  assert.equal(namaMirip('Andi  Baki', 'andi baki'), true);
  assert.equal(namaMirip('Andi Bakri', 'Andi Baki'), true); // jarak edit 1
  assert.equal(namaMirip('Andi', 'Andi Baki anak pak lurah'), true); // yang satu memuat yang lain
  assert.equal(namaMirip('Budi', 'Siti'), false);
  const p = await produk({ stok: [100] });
  await notaLunas({ items: [{ variant_id: p.warna[0], unit_id: p.biji, qty: 1 }], customerName: 'Sumarni Pasar' });
  await assert.rejects(
    nota({ items: [{ variant_id: p.warna[0], unit_id: p.biji, qty: 1 }], customerName: 'Sumarni Pasar Baru' }),
    (e) => e instanceof NamaMirip && e.mirip.some((c) => c.name === 'Sumarni Pasar')
  );
  await notaLunas({ items: [{ variant_id: p.warna[0], unit_id: p.biji, qty: 1 }], customerName: 'Sumarni Pasar Baru', pembeliBaru: true });
  assert.ok(await pembeli('Sumarni Pasar Baru'));
  // Nama yang persis sama memakai pembeli yang sudah ada tanpa pertanyaan.
  await notaLunas({ items: [{ variant_id: p.warna[0], unit_id: p.biji, qty: 1 }], customerName: 'Sumarni Pasar' });
});

test('Teks pengingat WhatsApp mengikuti template dan penanda', () => {
  const t = teksPengingat('Halo {nama} dari {toko}: {total}\n{rincian}\n{lewat_tempo}', {
    nama: 'Bu Ani', toko: 'Toko Jaya', total: 15000,
    notas: [
      { nomor: 'NT-1', tanggal: '2026-10-01', sisa: 5000, jatuh_tempo: '2026-10-08', lewat: 1 },
      { nomor: 'NT-2', tanggal: '2026-10-30', sisa: 10000, jatuh_tempo: '2026-11-06', lewat: 0 },
    ],
  });
  assert.match(t, /^Halo Bu Ani dari Toko Jaya: Rp 15\.000/);
  assert.match(t, /- NT-1 \(01\/10\/2026\): Rp 5\.000, jatuh tempo 08\/10\/2026/);
  assert.match(t, /1 nota sudah lewat jatuh tempo \(Rp 5\.000\)/);
});

test('Laporan: laba per kategori dikurangi retur, pergerakan stok dengan saldo berjalan, riwayat harga beli', async () => {
  const { perKategori, pergerakanStok, riwayatHargaBeli } = await import('../lib/laporan.js');
  const hari = (await queryOne('SELECT CURDATE() AS d')).d;
  const p = await produk({ stok: [50], cost: 500, category: 'UJILAPORAN' });
  const v = p.warna[0];
  const n = await notaLunas({ items: [{ variant_id: v, unit_id: p.biji, qty: 10 }], paidCash: 10000 });
  const it = await queryOne('SELECT id FROM sale_items WHERE sale_id = ?', [n.saleId]);
  await tx((q) => prosesRetur(q, { userId: STAF }, { sale_id: n.saleId, items: [{ sale_item_id: it.id, qty: 2 }] }));
  const k = (await perKategori(hari, hari)).find((x) => x.category === 'UJILAPORAN');
  assert.equal(k.omset, 8000);
  assert.equal(k.laba, 4000);

  await tx((q) => koreksiStok(q, { variantId: v, userId: STAF, delta: -5, note: 'hilang' }));
  const g = await pergerakanStok(p.pid, hari, hari);
  assert.equal(g.awal.jual, 50);
  assert.equal(g.akhir.jual, 37);
  assert.deepEqual(g.rows.map((r) => r.jenis), ['jual', 'retur', 'koreksi']);
  assert.equal(g.rows.at(-1).saldo_jual, 37);

  await tx((q) => catatPembelian(q, { userId: ADMIN, isAdmin: true, bolehModal: true }, { items: [{ product_id: p.pid, unit_name: 'dosin', factor: 12, qty: 2, unit_cost: 6600 }] }));
  const h = await riwayatHargaBeli(p.pid);
  assert.equal(h.length, 1);
  assert.equal(h[0].unit_cost, 6600);
});

test('Diskon rupiah: tersimpan per baris dengan pemberinya, satu grup warna dibulatkan sekali', async () => {
  const p = await produk({ stok: [5, 30] });
  const [a, b] = p.warna;
  // 1 dosin (Rp 10.000) diskon Rp 1.000, terpecah 5 biji warna A + 7 biji warna B.
  const n = await notaLunas({
    items: [
      { variant_id: a, unit_id: p.dosin, qty: 5 / 12, diskon_rp: 417, grup: 'g1' },
      { variant_id: b, unit_id: p.dosin, qty: 7 / 12, diskon_rp: 583, grup: 'g1' },
    ],
    paidCash: 9000,
  });
  const rows = await query('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id', [n.saleId]);
  assert.equal(rows.reduce((s, r) => s + r.subtotal, 0), 9000);
  assert.deepEqual(rows.map((r) => r.diskon_rp), [417, 583]);
  assert.ok(rows.every((r) => r.diskon_oleh === STAF && r.discount_pct === 0));
  await ditolak(nota({ items: [{ variant_id: b, unit_id: p.biji, qty: 1, diskon_rp: 1500 }], paidCash: 0 }), /melebihi/);
  await ditolak(nota({ items: [{ variant_id: b, unit_id: p.biji, qty: 1, diskon_rp: -1 }], paidCash: 1000 }), /tidak negatif/);
  const { diskonPerKasir } = await import('../lib/laporan.js');
  const hari = (await queryOne('SELECT CURDATE() AS d')).d;
  assert.ok((await diskonPerKasir(hari, hari)).find((x) => x.name === 'Staf').diskon >= 1000);
});

test('Stok awal: stok diganti hasil hitungan, selisih tercatat, warna diberi tanda', async () => {
  const p = await produk({ stok: [40] });
  const v = p.warna[0];
  const r = await tx((q) => isiStokAwal(q, { variantId: v, userId: STAF, jumlah: 36 }));
  assert.equal(r.sesudah, 36);
  assert.equal(await stok(v), 36);
  const adj = await queryOne("SELECT * FROM stock_adjustments WHERE variant_id = ? AND jenis = 'stok_awal'", [v]);
  assert.equal(adj.delta, -4);
  assert.equal(adj.note, 'stok awal');
  assert.ok((await queryOne('SELECT stok_awal_pada FROM variants WHERE id = ?', [v])).stok_awal_pada);
  // Hitungan sama dengan stok: tetap ditandai, tanpa koreksi baru.
  await tx((q) => isiStokAwal(q, { variantId: v, userId: STAF, jumlah: 36 }));
  assert.equal((await query("SELECT * FROM stock_adjustments WHERE variant_id = ? AND jenis = 'stok_awal'", [v])).length, 1);
  await ditolak(tx((q) => isiStokAwal(q, { variantId: v, userId: STAF, jumlah: -1 })), /tidak valid/);
});
