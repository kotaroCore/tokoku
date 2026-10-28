import { query, queryOne, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { BadRequest, tambahSaldo } from '@/lib/sales';

// Saldo titipan satu pembeli beserta riwayat perubahannya.
export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const customerId = Number(new URL(req.url).searchParams.get('customer_id'));
  const c = await queryOne('SELECT id, name, saldo FROM customers WHERE id = ?', [customerId]);
  if (!c) return Response.json({ error: 'Pembeli tidak ditemukan' }, { status: 404 });
  const mutasi = await query(
    `SELECT m.*, u.name AS oleh FROM saldo_mutasi m JOIN users u ON u.id = m.user_id
     WHERE m.customer_id = ? ORDER BY m.id DESC LIMIT 50`,
    [c.id]
  );
  return Response.json({ ...c, mutasi });
}

// Titip saldo: pembeli menyetor uang untuk dipakai di belanja berikutnya.
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const amount = Number(b.amount);

  try {
    const result = await tx(async (q) => {
      if (!(amount > 0)) throw new BadRequest('Jumlah titipan harus lebih dari 0');
      let [c] = b.customer_id
        ? await q('SELECT * FROM customers WHERE id = ? FOR UPDATE', [b.customer_id])
        : [];
      if (!c) {
        // Pembeli baru: nama wajib spesifik, sama seperti pembeli berhutang.
        const name = (b.customer_name || '').trim();
        if (!name) throw new BadRequest('Isi nama pembeli');
        [c] = await q('SELECT * FROM customers WHERE name = ? FOR UPDATE', [name]);
        if (!c) {
          const r = await q('INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)', [name, b.customer_phone || null, b.customer_address || null]);
          [c] = await q('SELECT * FROM customers WHERE id = ?', [r.insertId]);
        }
      }
      await tambahSaldo(q, c.id, amount, session.uid, { jenis: 'titip', note: (b.note || '').trim() || null });
      const [{ saldo }] = await q('SELECT saldo FROM customers WHERE id = ?', [c.id]);
      return { saldo, customer_id: c.id };
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}
