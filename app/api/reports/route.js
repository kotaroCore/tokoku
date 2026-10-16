import { query, queryOne } from '@/lib/db';
import { requireApi } from '@/lib/auth';

export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const date =
    new URL(req.url).searchParams.get('date') ||
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  const totals = await queryOne(
    `SELECT COUNT(*) AS jumlah_nota, COALESCE(SUM(total),0) AS omset, COALESCE(SUM(paid_cash),0) AS cash,
            COALESCE(SUM(paid_ewallet),0) AS ewallet, COALESCE(SUM(paid_transfer),0) AS transfer,
            COALESCE(SUM(hutang),0) AS hutang_baru
     FROM sales WHERE DATE(created_at) = ?`,
    [date]
  );
  const { v: hutangDibayar } = await queryOne(
    'SELECT COALESCE(SUM(amount),0) AS v FROM debt_payments WHERE DATE(created_at) = ?',
    [date]
  );
  const perChannel = await query(
    'SELECT channel, COUNT(*) AS nota, SUM(total) AS omset FROM sales WHERE DATE(created_at) = ? GROUP BY channel',
    [date]
  );
  const perUser = await query(
    `SELECT u.name, COUNT(*) AS nota, SUM(s.total) AS omset FROM sales s JOIN users u ON u.id = s.user_id
     WHERE DATE(s.created_at) = ? GROUP BY u.id, u.name`,
    [date]
  );
  const terlaris = await query(
    `SELECT i.product_name, SUM(i.qty * i.factor) AS qty_dasar, SUM(i.subtotal) AS omset
     FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE DATE(s.created_at) = ?
     GROUP BY i.product_name ORDER BY omset DESC LIMIT 10`,
    [date]
  );
  const shifts = await query(
    `SELECT u.name, sh.started_at, sh.ended_at,
       (SELECT COUNT(*) FROM sales s WHERE s.shift_id = sh.id) AS nota
     FROM shifts sh JOIN users u ON u.id = sh.user_id WHERE DATE(sh.started_at) = ? ORDER BY sh.started_at`,
    [date]
  );
  const retur = await queryOne(
    `SELECT COUNT(*) AS jumlah, COALESCE(SUM(total),0) AS total, COALESCE(SUM(hutang_reduced),0) AS hutang_dikurangi,
            COALESCE(SUM(CASE WHEN refund_method = 'cash' THEN refund_amount END),0) AS cash,
            COALESCE(SUM(CASE WHEN refund_method = 'ewallet' THEN refund_amount END),0) AS ewallet,
            COALESCE(SUM(CASE WHEN refund_method = 'transfer' THEN refund_amount END),0) AS transfer
     FROM sale_returns WHERE DATE(created_at) = ?`,
    [date]
  );
  const pembelian = await queryOne(
    `SELECT COUNT(*) AS jumlah, COALESCE(SUM(total),0) AS total,
            COALESCE(SUM(CASE WHEN pay_method = 'cash' THEN total END),0) AS cash,
            COALESCE(SUM(CASE WHEN pay_method = 'ewallet' THEN total END),0) AS ewallet,
            COALESCE(SUM(CASE WHEN pay_method = 'transfer' THEN total END),0) AS transfer
     FROM purchases WHERE DATE(created_at) = ?`,
    [date]
  );
  // Modal memakai harga beli produk saat ini; produk tanpa harga beli tidak dihitung labanya.
  const laba = await queryOne(
    `SELECT COALESCE(SUM(i.subtotal - i.qty * i.factor * p.cost),0) AS laba
     FROM sale_items i JOIN sales s ON s.id = i.sale_id
     JOIN variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id
     WHERE DATE(s.created_at) = ? AND p.cost > 0`,
    [date]
  );
  // Laba porsi cash: nota campuran dibagi sesuai porsi yang dibayar cash.
  const { v: labaCash } = await queryOne(
    `SELECT COALESCE(SUM((i.subtotal - i.qty * i.factor * p.cost) * s.paid_cash / NULLIF(s.total,0)),0) AS v
     FROM sale_items i JOIN sales s ON s.id = i.sale_id
     JOIN variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id
     WHERE DATE(s.created_at) = ? AND p.cost > 0`,
    [date]
  );
  const { v: tanpaModal } = await queryOne(
    `SELECT COUNT(*) AS v FROM sale_items i JOIN sales s ON s.id = i.sale_id
     JOIN variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id
     WHERE DATE(s.created_at) = ? AND p.cost = 0`,
    [date]
  );
  const { v: totalHutang } = await queryOne('SELECT COALESCE(SUM(total_hutang),0) AS v FROM customers');
  return Response.json({ date, ...totals, hutangDibayar, retur, pembelian, laba: laba.laba, labaCash: Math.round(labaCash),tanpaModal, perChannel, perUser, terlaris, shifts, totalHutang });
}
