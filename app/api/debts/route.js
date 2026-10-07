import { db } from '@/lib/db';
import { requireApi } from '@/lib/auth';

export async function GET() {
  const { error } = await requireApi();
  if (error) return error;
  return Response.json(
    db.prepare('SELECT * FROM customers WHERE total_hutang > 0 ORDER BY total_hutang DESC').all()
  );
}

// Bayar hutang tanpa belanja baru.
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const { customer_id, amount } = await req.json();
  const amt = Number(amount);
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
  if (!c) return Response.json({ error: 'Pembeli tidak ditemukan' }, { status: 404 });
  if (!(amt > 0) || amt > c.total_hutang) {
    return Response.json({ error: 'Jumlah tidak valid (maks sesuai sisa hutang)' }, { status: 400 });
  }
  db.transaction(() => {
    db.prepare('INSERT INTO debt_payments (customer_id, user_id, amount) VALUES (?, ?, ?)').run(c.id, session.uid, amt);
    db.prepare('UPDATE customers SET total_hutang = total_hutang - ? WHERE id = ?').run(amt, c.id);
  })();
  return Response.json({ ok: true });
}

// Perbarui kontak pembeli (nomor WA / alamat).
export async function PATCH(req) {
  const { error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  db.prepare('UPDATE customers SET phone = ?, address = ? WHERE id = ?').run(b.phone || null, b.address || null, b.id);
  return Response.json({ ok: true });
}
