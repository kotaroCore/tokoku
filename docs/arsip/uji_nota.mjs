// Uji logika nota terhadap database nyata (jalankan setelah schema + migrasi).
// Pakai: DB_NAME=tokoku_fase1 node scripts/uji_nota.mjs
import { buatDraf, tambahPembayaran, lunasi, batalkan, closeNotaDb, pool } from '../lib/nota.js';

const USER = 1;          // owner
const VARIAN = 1;        // Benang Yamalaon Kecil - Hitam (stok 600 biji)
const SAT_BIJI = 1;      // satuan biji, harga 2000
const SAT_DOSIN = 2;     // satuan dosin, harga 21500, isi 12

let gagal = 0;
const cek = (nama, kondisi, detail = '') => {
  console.log(`${kondisi ? 'LULUS' : 'GAGAL'}  ${nama}${detail ? '  -> ' + detail : ''}`);
  if (!kondisi) gagal++;
};
async function harusGagal(fn) {
  try { await fn(); return null; } catch (e) { return e.message; }
}
const stok = async (id = VARIAN) => Number((await pool().query('SELECT stok FROM varian WHERE id=?', [id]))[0][0].stok);
const status = async (id) => (await pool().query('SELECT status FROM nota WHERE id=?', [id]))[0][0].status;

const stokAwal = await stok();

// T1: draf tidak mengurangi stok
const d1 = await buatDraf(USER, { items: [{ varianId: VARIAN, satuanHargaId: SAT_BIJI, jumlah: 10 }] });
cek('T1 draf tidak mengurangi stok', (await stok()) === stokAwal, `stok ${await stok()}`);

// T2: lunas tanpa pembayaran ditolak
let e = await harusGagal(() => lunasi(USER, d1.notaId));
cek('T2 lunas tanpa pembayaran ditolak', !!e, e);

// T3: bayar pas lalu lunas -> stok berkurang, mutasi tercatat
await tambahPembayaran(USER, d1.notaId, { metode: 'cash', jumlah: 20000 });
await lunasi(USER, d1.notaId);
cek('T3 lunas mengurangi stok 10 biji', (await stok()) === stokAwal - 10, `stok ${await stok()}`);
const [[mut]] = await pool().query("SELECT COUNT(*) AS n FROM mutasi_stok WHERE ref_tipe='nota' AND ref_id=?", [d1.notaId]);
cek('T3 mutasi jual tercatat', mut.n === 1);
cek('T3 status nota = lunas', (await status(d1.notaId)) === 'lunas');

// T4: lunas dua kali ditolak
e = await harusGagal(() => lunasi(USER, d1.notaId));
cek('T4 lunas dua kali ditolak', !!e, e);

// T5: stok tidak cukup -> lunas gagal, nota tetap draf, stok tidak berubah
const sebelum = await stok();
const d2 = await buatDraf(USER, { items: [{ varianId: VARIAN, satuanHargaId: SAT_BIJI, jumlah: 100000 }] });
await tambahPembayaran(USER, d2.notaId, { metode: 'cash', jumlah: d2.totalTagihan });
e = await harusGagal(() => lunasi(USER, d2.notaId));
cek('T5 stok kurang menolak lunas', !!e, e);
cek('T5 nota tetap draf & stok utuh', (await status(d2.notaId)) === 'draft' && (await stok()) === sebelum);

// T6: batal draf boleh, batal lunas tidak
await batalkan(USER, d2.notaId, 'stok tidak cukup');
cek('T6 batal draf berhasil', (await status(d2.notaId)) === 'batal');
e = await harusGagal(() => batalkan(USER, d1.notaId, 'coba'));
cek('T6 batal nota lunas ditolak', !!e, e);

// T7: e-wallet menunggu menghalangi lunas, lalu lunas setelah dana masuk
const d3 = await buatDraf(USER, { items: [{ varianId: VARIAN, satuanHargaId: SAT_BIJI, jumlah: 5 }] });
const pay = await tambahPembayaran(USER, d3.notaId, { metode: 'qris', jumlah: 10000 });
e = await harusGagal(() => lunasi(USER, d3.notaId));
cek('T7 qris menunggu menolak lunas', !!e, e);
await pool().query("UPDATE pembayaran SET status='diterima' WHERE id=?", [pay.pembayaranId]);
await lunasi(USER, d3.notaId);
cek('T7 lunas setelah dana masuk', (await status(d3.notaId)) === 'lunas');

// T8: tier V (tanpa nama) tidak boleh berhutang
const d4 = await buatDraf(USER, { items: [{ varianId: VARIAN, satuanHargaId: SAT_BIJI, jumlah: 15 }] });
await tambahPembayaran(USER, d4.notaId, { metode: 'hutang', jumlah: d4.totalTagihan });
e = await harusGagal(() => lunasi(USER, d4.notaId));
cek('T8 tier V ditolak', !!e, e);
await batalkan(USER, d4.notaId, 'uji tier V');

// Pembeli tier A: Andi Uji
const [ins] = await pool().query("INSERT INTO konsumen (nama, dibuat_oleh) VALUES ('Andi Uji', ?)", [USER]);
const KA = ins.insertId;

// T9: tier A maks Rp 200.000 per nota
const d5 = await buatDraf(USER, { konsumenId: KA, items: [{ varianId: VARIAN, satuanHargaId: SAT_DOSIN, jumlah: 12 }] });
await tambahPembayaran(USER, d5.notaId, { metode: 'hutang', jumlah: d5.totalTagihan }); // 258.000
e = await harusGagal(() => lunasi(USER, d5.notaId));
cek('T9 tier A > Rp 200.000 ditolak', !!e, e);
await batalkan(USER, d5.notaId, 'uji tier A');

// T10: tier A hutang 150.500, lalu nota berikutnya ditolak karena sisa >= 100.000
const d6 = await buatDraf(USER, { konsumenId: KA, items: [{ varianId: VARIAN, satuanHargaId: SAT_DOSIN, jumlah: 7 }] });
await tambahPembayaran(USER, d6.notaId, { metode: 'hutang', jumlah: d6.totalTagihan });
await lunasi(USER, d6.notaId);
const d7 = await buatDraf(USER, { konsumenId: KA, items: [{ varianId: VARIAN, satuanHargaId: SAT_BIJI, jumlah: 30 }] });
await tambahPembayaran(USER, d7.notaId, { metode: 'hutang', jumlah: d7.totalTagihan });
e = await harusGagal(() => lunasi(USER, d7.notaId));
cek('T10 tier A wajib lunas hutang lama dulu', !!e, e);
await batalkan(USER, d7.notaId, 'uji tier A lama');

// T11: tier B (dikenal) boleh berhutang lagi di atas Rp 200.000
await pool().query('INSERT INTO konsumen_dikenal (konsumen_id, user_id) VALUES (?, ?)', [KA, USER]);
const d8 = await buatDraf(USER, { konsumenId: KA, items: [{ varianId: VARIAN, satuanHargaId: SAT_DOSIN, jumlah: 12 }] });
await tambahPembayaran(USER, d8.notaId, { metode: 'hutang', jumlah: d8.totalTagihan }); // 258.000
await lunasi(USER, d8.notaId);
cek('T11 tier B boleh hutang lagi (sisa lama tidak menghalangi)', (await status(d8.notaId)) === 'lunas');

// T12: diskon wajib mencatat siapa yang memberi
e = await harusGagal(() => buatDraf(USER, { items: [{ varianId: VARIAN, satuanHargaId: SAT_BIJI, jumlah: 1, diskonPersen: 10 }] }));
cek('T12 diskon tanpa pencatat ditolak', !!e, e);

// T13: integritas: tidak ada stok negatif & stok = awal - jumlah lunas
const [[minus]] = await pool().query('SELECT COUNT(*) AS n FROM varian WHERE stok < 0');
cek('T13 tidak ada stok negatif', minus.n === 0);

console.log(`\n${gagal === 0 ? 'SEMUA LULUS' : gagal + ' GAGAL'}`);
await closeNotaDb();
process.exit(gagal === 0 ? 0 : 1);
