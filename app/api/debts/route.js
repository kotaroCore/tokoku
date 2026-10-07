import { query, queryOne, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';

export async function GET() {
  const { error } = await requireApi();
  if (error) return error;
  return Response.json(await query('SELECT * FROM customers WHERE total_hutang > 0 ORDER BY total_hutang DESC'));
}

// Bayar hutang tanpa belanja baru.
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const { customer_id, amount } = await req.json();
  const amt = Number(amount);
  const c = await queryOne('SELECT * FROM customers WHERE id = ?', [customer_id]);
  if (!c) return Response.json({ error: 'Pembeli tidak ditemukan' }, { status: 404 });
  if (!(amt > 0) || amt > c.total_hutang) {
    return Response.json({ error: 'Jumlah tidak valid (maks sesuai sisa hutang)' }, { status: 400 });
  }
  await tx(async (q) => {
    await q('INSERT INTO debt_payments (customer_id, user_id, amount) VALUES (?, ?, ?)', [c.id, session.uid, amt]);
    await q('UPDATE customers SET total_hutang = total_hutang - ? WHERE id = ?', [amt, c.id]);
  });
  return Response.json({ ok: true });
}

// Perbarui kontak pembeli (nomor WA / alamat).
export async function PATCH(req) {
  const { error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  await query('UPDATE customers SET phone = ?, address = ? WHERE id = ?', [b.phone || null, b.address || null, b.id]);
  return Response.json({ ok: true });
}
