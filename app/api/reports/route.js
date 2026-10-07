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
  const { v: totalHutang } = await queryOne('SELECT COALESCE(SUM(total_hutang),0) AS v FROM customers');
  return Response.json({ date, ...totals, hutangDibayar, perChannel, perUser, terlaris, shifts, totalHutang });
}
