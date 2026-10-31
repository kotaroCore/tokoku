import { query, queryOne } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { boleh } from '@/lib/izin';
import { getSettings } from '@/lib/settings';
import { perKategori, labaTotal, tren, laris, lambat, hutangLewat, rusak } from '@/lib/laporan';

const hariIni = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

// Laporan untuk rentang tanggal [from, to] (inklusif). Parameter lama `date` tetap didukung.
// ?tren=hari|minggu|bulan mengatur pengelompokan grafik tren.
// Laba, modal, dan nilai stok hanya untuk admin / staf berizin laporan_laba; staf lain mendapat laporan penjualan saja.
export async function GET(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const sp = new URL(req.url).searchParams;
  let from = sp.get('from') || sp.get('date') || hariIni();
  let to = sp.get('to') || from;
  if (!TANGGAL.test(from) || !TANGGAL.test(to)) {
    return Response.json({ error: 'Format tanggal harus YYYY-MM-DD' }, { status: 400 });
  }
  if (to < from) [from, to] = [to, from];
  const rentang = [from, to];

  const totals = await queryOne(
    `SELECT COUNT(*) AS jumlah_nota, COALESCE(SUM(total),0) AS omset, COALESCE(SUM(paid_cash),0) AS cash,
            COALESCE(SUM(paid_ewallet),0) AS ewallet, COALESCE(SUM(paid_transfer),0) AS transfer,
            COALESCE(SUM(hutang),0) AS hutang_baru, COALESCE(SUM(pembulatan),0) AS pembulatan
     FROM sales WHERE status = 'lunas' AND DATE(created_at) BETWEEN ? AND ?`,
    rentang
  );
  const { v: hutangDibayar } = await queryOne(
    'SELECT COALESCE(SUM(amount),0) AS v FROM debt_payments WHERE DATE(created_at) BETWEEN ? AND ?',
    rentang
  );
  const perChannel = await query(
    "SELECT channel, COUNT(*) AS nota, SUM(total) AS omset FROM sales WHERE status = 'lunas' AND DATE(created_at) BETWEEN ? AND ? GROUP BY channel",
    rentang
  );
  const perUser = await query(
    `SELECT u.name, COUNT(*) AS nota, SUM(s.total) AS omset FROM sales s JOIN users u ON u.id = s.user_id
     WHERE s.status = 'lunas' AND DATE(s.created_at) BETWEEN ? AND ? GROUP BY u.id, u.name`,
    rentang
  );
  const terlaris = await query(
    `SELECT i.product_name, SUM(i.qty * i.factor) AS qty_dasar, SUM(i.subtotal) AS omset
     FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE s.status = 'lunas' AND DATE(s.created_at) BETWEEN ? AND ?
     GROUP BY i.product_name ORDER BY omset DESC LIMIT 10`,
    rentang
  );
  const shifts = await query(
    `SELECT u.name, sh.started_at, sh.ended_at,
       (SELECT COUNT(*) FROM sales s WHERE s.shift_id = sh.id AND s.status = 'lunas') AS nota
     FROM shifts sh JOIN users u ON u.id = sh.user_id WHERE DATE(sh.started_at) BETWEEN ? AND ? ORDER BY sh.started_at`,
    rentang
  );
  const retur = await queryOne(
    `SELECT COUNT(*) AS jumlah, COALESCE(SUM(total),0) AS total, COALESCE(SUM(hutang_reduced),0) AS hutang_dikurangi,
            COALESCE(SUM(CASE WHEN refund_method = 'cash' THEN refund_amount END),0) AS cash,
            COALESCE(SUM(CASE WHEN refund_method = 'ewallet' THEN refund_amount END),0) AS ewallet,
            COALESCE(SUM(CASE WHEN refund_method = 'transfer' THEN refund_amount END),0) AS transfer
     FROM sale_returns WHERE DATE(created_at) BETWEEN ? AND ?`,
    rentang
  );
  const pembelian = await queryOne(
    `SELECT COUNT(*) AS jumlah, COALESCE(SUM(total),0) AS total,
            COALESCE(SUM(CASE WHEN pay_method = 'cash' THEN total END),0) AS cash,
            COALESCE(SUM(CASE WHEN pay_method = 'ewallet' THEN total END),0) AS ewallet,
            COALESCE(SUM(CASE WHEN pay_method = 'transfer' THEN total END),0) AS transfer
     FROM purchases WHERE DATE(created_at) BETWEEN ? AND ?`,
    rentang
  );
  const { v: totalHutang } = await queryOne('SELECT COALESCE(SUM(total_hutang),0) AS v FROM customers');
  const bolehLaba = boleh(session, 'laporan_laba');
  const hariLambat = Number((await getSettings()).hari_lambat_laku) || 30;
  const [kategori, laba, trenData, larisData, lambatData, hutangLewatData, rusakData] = await Promise.all([
    perKategori(from, to), labaTotal(from, to), tren(from, to, sp.get('tren') || 'hari'), laris(from, to),
    lambat(hariLambat), hutangLewat(), rusak(from, to),
  ]);
  const tanpa = (rows, ...keys) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !keys.includes(k))));
  const lanjut = {
    bolehLaba,
    hariLambat,
    perKategori: bolehLaba ? kategori : tanpa(kategori, 'laba', 'margin'),
    laba: bolehLaba ? laba : null,
    tren: trenData,
    laris: larisData,
    lambat: bolehLaba ? lambatData : tanpa(lambatData, 'nilai'),
    hutangLewat: hutangLewatData,
    rusak: bolehLaba ? rusakData : { sekarang: tanpa(rusakData.sekarang, 'nilai'), keluar: tanpa(rusakData.keluar, 'nilai_dibuang'), kerugian: null },
  };

  // Kas per metode: uang masuk dari penjualan dikurangi uang keluar untuk retur dan pembelian.
  // Pembayaran hutang tidak punya metode bayar di database, jadi tidak ikut dihitung di sini.
  const kas = {};
  for (const m of ['cash', 'ewallet', 'transfer']) {
    const masuk = Number(totals[m]);
    const keluar = Number(retur[m]) + Number(pembelian[m]);
    kas[m] = { masuk, keluar, bersih: masuk - keluar };
  }

  return Response.json({
    from,
    to,
    ...totals,
    hutangDibayar,
    retur,
    pembelian,
    kas,
    perChannel,
    perUser,
    terlaris,
    shifts,
    totalHutang,
    ...lanjut,
  });
}
