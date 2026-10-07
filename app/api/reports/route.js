import { db } from '@/lib/db';
import { requireApi } from '@/lib/auth';

export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const date =
    new URL(req.url).searchParams.get('date') ||
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS jumlah_nota, COALESCE(SUM(total),0) AS omset, COALESCE(SUM(paid_cash),0) AS cash,
              COALESCE(SUM(paid_ewallet),0) AS ewallet, COALESCE(SUM(paid_transfer),0) AS transfer,
              COALESCE(SUM(hutang),0) AS hutang_baru
       FROM sales WHERE date(created_at) = ?`
    )
    .get(date);
  const hutangDibayar = db
    .prepare('SELECT COALESCE(SUM(amount),0) AS v FROM debt_payments WHERE date(created_at) = ?')
    .get(date).v;
  const perChannel = db
    .prepare('SELECT channel, COUNT(*) AS nota, SUM(total) AS omset FROM sales WHERE date(created_at) = ? GROUP BY channel')
    .all(date);
  const perUser = db
    .prepare(
      `SELECT u.name, COUNT(*) AS nota, SUM(s.total) AS omset FROM sales s JOIN users u ON u.id = s.user_id
       WHERE date(s.created_at) = ? GROUP BY u.id`
    )
    .all(date);
  const terlaris = db
    .prepare(
      `SELECT i.product_name, SUM(i.qty * i.factor) AS qty_dasar, SUM(i.subtotal) AS omset
       FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE date(s.created_at) = ?
       GROUP BY i.product_name ORDER BY omset DESC LIMIT 10`
    )
    .all(date);
  const shifts = db
    .prepare(
      `SELECT u.name, sh.started_at, sh.ended_at,
         (SELECT COUNT(*) FROM sales s WHERE s.shift_id = sh.id) AS nota
       FROM shifts sh JOIN users u ON u.id = sh.user_id WHERE date(sh.started_at) = ? ORDER BY sh.started_at`
    )
    .all(date);
  const totalHutang = db.prepare('SELECT COALESCE(SUM(total_hutang),0) AS v FROM customers').get().v;
  return Response.json({ date, ...totals, hutangDibayar, perChannel, perUser, terlaris, shifts, totalHutang });
}
