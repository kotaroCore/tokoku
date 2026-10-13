// Logika nota (Fase 1): draf -> pembayaran -> lunas / batal.
// Aturan dari SKEMA_DATABASE_FASE1.md:
//   - Stok HANYA berkurang saat nota lunas (bukan saat draf dibuat).
//   - Item tanpa warna (varian_id NULL) tidak mengurangi stok sekarang;
//     stoknya dikurangi saat warna diisi di cek sore (belum dibuat).
//   - Hutang: tier V (tanpa nama) ditolak; tier A maks Rp 200.000 per nota dan
//     wajib lunas dulu bila sisa hutang lama >= Rp 100.000; tier B (dikenal)
//     maks Rp 500.000 per nota dan boleh berhutang lagi.
//   - Nota lunas tidak boleh dibatalkan; nota batal tidak dihapus.
import mysql from 'mysql2/promise';

export class NotaError extends Error {}

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tokoku_fase1',
  decimalNumbers: true,
  connectionLimit: 10,
};

const g = globalThis;
export function pool() {
  if (!g.__tokokuNotaPool) g.__tokokuNotaPool = mysql.createPool(cfg);
  return g.__tokokuNotaPool;
}
export const closeNotaDb = () => (g.__tokokuNotaPool ? g.__tokokuNotaPool.end() : Promise.resolve());

const BATAS = { tierA: 200000, tierAHutangLama: 100000, tierB: 500000 };

async function tx(fn) {
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

// Nomor NT-YYYYMMDD-#### dari nomor_urut (aman untuk dua kasir bersamaan)
async function nomorBaru(q, jenis = 'NT') {
  const [{ ymd }] = await q("SELECT DATE_FORMAT(CURDATE(), '%Y%m%d') AS ymd");
  await q(
    `INSERT INTO nomor_urut (jenis, tanggal, terakhir) VALUES (?, CURDATE(), 1)
     ON DUPLICATE KEY UPDATE terakhir = LAST_INSERT_ID(terakhir + 1)`,
    [jenis]
  );
  const [{ n }] = await q('SELECT LAST_INSERT_ID() AS n');
  return `${jenis}-${ymd}-${String(n).padStart(4, '0')}`;
}

async function ambilNota(q, id, lock = false) {
  const [nota] = await q(`SELECT * FROM nota WHERE id = ? ${lock ? 'FOR UPDATE' : ''}`, [id]);
  if (!nota) throw new NotaError('Nota tidak ditemukan');
  return nota;
}

// Membuat nota draf. Stok TIDAK dikurangi di sini.
// items: [{ varianId, satuanHargaId, jumlah, diskonPersen?, jenisDiskon?, alasanDiskon? }]
export async function buatDraf(userId, { jenis = 'toko', konsumenId = null, ongkir = 0, catatan = null, items }) {
  if (!items?.length) throw new NotaError('Keranjang kosong');
  return tx(async (q) => {
    let totalBarang = 0;
    const baris = [];
    for (const it of items) {
      const [sh] = await q(
        `SELECT sh.*, v.id AS varian_id, v.produk_id AS v_produk
         FROM satuan_harga sh
         LEFT JOIN varian v ON v.id = ?
         WHERE sh.id = ? AND sh.aktif = 1`,
        [it.varianId ?? null, it.satuanHargaId]
      );
      if (!sh) throw new NotaError('Satuan harga tidak valid');
      const jumlah = Number(it.jumlah);
      if (!(jumlah > 0)) throw new NotaError('Jumlah harus lebih dari 0');
      if (it.varianId && sh.v_produk !== sh.produk_id) {
        throw new NotaError('Warna tidak sesuai dengan produk');
      }
      const diskonPersen = Math.min(100, Math.max(0, Number(it.diskonPersen) || 0));
      const kotor = Math.round(jumlah * sh.harga_jual);
      const subtotal = Math.round(kotor * (1 - diskonPersen / 100));
      if (diskonPersen > 0 && !it.alasanDiskon && !it.diskonOleh) {
        throw new NotaError('Diskon harus mencatat siapa yang memberi');
      }
      totalBarang += subtotal;
      baris.push({ ...it, sh, jumlah, diskon: kotor - subtotal, subtotal, kotor, diskonPersen });
    }

    const totalTagihan = totalBarang + (jenis === 'online' ? Number(ongkir) || 0 : 0);
    const r = await q(
      `INSERT INTO nota (nomor, jenis, status, konsumen_id, total_barang, ongkir,
                         bayar_hutang_lama, total_tagihan, catatan, dibuat_oleh)
       VALUES (?, ?, 'draft', ?, ?, ?, 0, ?, ?, ?)`,
      [await nomorBaru(q), jenis, konsumenId, totalBarang, jenis === 'online' ? Number(ongkir) || 0 : 0, totalTagihan, catatan, userId]
    );
    const notaId = r.insertId;

    for (const b of baris) {
      await q(
        `INSERT INTO nota_item (nota_id, produk_id, varian_id, satuan_harga_id, nama_satuan, isi,
                                jumlah, harga_satuan, diskon, jenis_diskon, diskon_oleh, alasan_diskon,
                                subtotal, stok_dikurangi)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          notaId, b.sh.produk_id, b.varianId ?? null, b.sh.id, b.sh.nama_satuan, b.sh.isi,
          b.jumlah, b.sh.harga_jual, b.diskon,
          b.diskon > 0 ? (b.jenisDiskon || 'staf') : null,
          b.diskon > 0 ? (b.diskonOleh || userId) : null,
          b.alasanDiskon || null, b.subtotal,
        ]
      );
    }
    return { notaId, totalBarang, totalTagihan };
  });
}

// Mencatat satu cara bayar. Status 'menunggu' untuk e-wallet/transfer sampai dana dicek.
export async function tambahPembayaran(userId, notaId, { metode, jumlah, status }) {
  const metodeValid = ['cash', 'qris', 'gopay', 'shopeepay', 'transfer', 'hutang', 'saldo'];
  if (!metodeValid.includes(metode)) throw new NotaError('Metode bayar tidak dikenal');
  if (!(Number(jumlah) > 0)) throw new NotaError('Jumlah bayar harus lebih dari 0');
  const st = status || (['cash', 'hutang', 'saldo'].includes(metode) ? 'diterima' : 'menunggu');
  return tx(async (q) => {
    const nota = await ambilNota(q, notaId, true);
    if (nota.status !== 'draft') throw new NotaError('Hanya nota draf yang bisa ditambah pembayaran');
    const r = await q(
      'INSERT INTO pembayaran (nota_id, metode, jumlah, status, dikonfirmasi_oleh, dikonfirmasi_pada) VALUES (?, ?, ?, ?, ?, ?)',
      [notaId, metode, Math.round(jumlah), st, st === 'diterima' ? userId : null, st === 'diterima' ? new Date() : null]
    );
    return { pembayaranId: r.insertId };
  });
}

// Konfirmasi dana e-wallet/transfer sudah masuk.
export async function konfirmasiPembayaran(userId, pembayaranId) {
  return tx(async (q) => {
    const [p] = await q('SELECT * FROM pembayaran WHERE id = ? FOR UPDATE', [pembayaranId]);
    if (!p) throw new NotaError('Pembayaran tidak ditemukan');
    if (p.status !== 'menunggu') throw new NotaError('Pembayaran sudah diterima');
    await q("UPDATE pembayaran SET status = 'diterima', dikonfirmasi_oleh = ?, dikonfirmasi_pada = NOW() WHERE id = ?", [userId, pembayaranId]);
  });
}

// Pengaturan hutang per tier. Tier V (tanpa nama) tidak boleh berhutang.
async function cekHutangBaru(q, konsumenId, jumlahHutang) {
  if (jumlahHutang <= 0) return;
  if (!konsumenId) throw new NotaError('Hutang wajib memakai nama pembeli (tier V ditolak)');
  const [{ dikenal }] = await q('SELECT COUNT(*) AS dikenal FROM konsumen_dikenal WHERE konsumen_id = ?', [konsumenId]);
  if (dikenal > 0) {
    if (jumlahHutang > BATAS.tierB) throw new NotaError(`Hutang per nota maks Rp ${BATAS.tierB.toLocaleString('id-ID')}`);
    return;
  }
  const [{ sisaLama }] = await q(
    "SELECT COALESCE(SUM(sisa), 0) AS sisaLama FROM hutang WHERE konsumen_id = ? AND status = 'belum_lunas'",
    [konsumenId]
  );
  if (sisaLama >= BATAS.tierAHutangLama) {
    throw new NotaError(`Hutang lama Rp ${sisaLama.toLocaleString('id-ID')} harus dilunasi dulu sebelum berhutang lagi`);
  }
  if (jumlahHutang > BATAS.tierA) throw new NotaError(`Hutang per nota maks Rp ${BATAS.tierA.toLocaleString('id-ID')} untuk pembeli tier A`);
}

// Melunasi nota: cek pembayaran, kurangi stok, catat mutasi, buat hutang bila ada.
export async function lunasi(userId, notaId) {
  return tx(async (q) => {
    const nota = await ambilNota(q, notaId, true);
    if (nota.status !== 'draft') throw new NotaError(`Nota sudah ${nota.status}`);

    const [pay] = await q(
      `SELECT COALESCE(SUM(CASE WHEN status = 'diterima' AND metode <> 'hutang' THEN jumlah ELSE 0 END), 0) AS diterima,
              COALESCE(SUM(CASE WHEN status = 'diterima' AND metode = 'hutang' THEN jumlah ELSE 0 END), 0) AS hutang,
              COALESCE(SUM(CASE WHEN status = 'menunggu' THEN 1 ELSE 0 END), 0) AS menunggu
       FROM pembayaran WHERE nota_id = ?`,
      [notaId]
    );
    if (pay.menunggu > 0) throw new NotaError('Masih ada pembayaran yang menunggu dana masuk');
    const tercatat = pay.diterima + pay.hutang;
    if (tercatat !== nota.total_tagihan) {
      throw new NotaError(`Pembayaran Rp ${tercatat} belum sama dengan tagihan Rp ${nota.total_tagihan}`);
    }

    // Stok: kunci tiap varian, kurangi hanya bila cukup. Gagal satu = seluruh lunas dibatalkan.
    const items = await q('SELECT * FROM nota_item WHERE nota_id = ? AND stok_dikurangi = 0', [notaId]);
    for (const it of items) {
      if (!it.varian_id) continue; // menunggu warna diisi di cek sore
      const butuh = Number(it.jumlah) * Number(it.isi);
      const upd = await q('UPDATE varian SET stok = stok - ? WHERE id = ? AND stok >= ?', [butuh, it.varian_id, butuh]);
      if (upd.affectedRows === 0) {
        const [v] = await q('SELECT stok FROM varian WHERE id = ?', [it.varian_id]);
        throw new NotaError(`Stok tidak cukup (sisa ${v?.stok ?? 0}). Kurangi jumlah atau batalkan nota.`);
      }
      const [{ stok: saldo }] = await q('SELECT stok FROM varian WHERE id = ?', [it.varian_id]);
      await q(
        `INSERT INTO mutasi_stok (varian_id, jenis, kolom, jumlah, saldo_sesudah, ref_tipe, ref_id, user_id)
         VALUES (?, 'jual', 'stok', ?, ?, 'nota', ?, ?)`,
        [it.varian_id, -butuh, saldo, notaId, userId]
      );
      await q('UPDATE nota_item SET stok_dikurangi = 1 WHERE id = ?', [it.id]);
    }

    if (pay.hutang > 0) {
      await cekHutangBaru(q, nota.konsumen_id, pay.hutang);
      await q('INSERT INTO hutang (konsumen_id, nota_id, jumlah_awal, sisa) VALUES (?, ?, ?, ?)', [
        nota.konsumen_id, notaId, pay.hutang, pay.hutang,
      ]);
    }

    await q(
      "UPDATE nota SET status = 'lunas', lunas_oleh = ?, lunas_pada = NOW(), total_akhir = total_tagihan WHERE id = ?",
      [userId, notaId]
    );
    return { notaId, hutang: pay.hutang };
  });
}

// Membatalkan nota draf. Stok belum pernah dikurangi, jadi tidak ada yang perlu dikembalikan.
export async function batalkan(userId, notaId, alasan) {
  if (!alasan?.trim()) throw new NotaError('Alasan pembatalan wajib diisi');
  return tx(async (q) => {
    const nota = await ambilNota(q, notaId, true);
    if (nota.status === 'lunas') throw new NotaError('Nota lunas tidak bisa dibatalkan (gunakan retur)');
    if (nota.status === 'batal') throw new NotaError('Nota sudah dibatalkan');
    await q(
      "UPDATE nota SET status = 'batal', batal_oleh = ?, batal_pada = NOW(), alasan_batal = ? WHERE id = ?",
      [userId, alasan.trim(), notaId]
    );
  });
}
