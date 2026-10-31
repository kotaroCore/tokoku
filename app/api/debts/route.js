import { query, queryOne, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { bayarHutang } from '@/lib/sales';
import { catatDompet } from '@/lib/dompet';
import { catatBeda } from '@/lib/catatan';

// Pembeli yang masih berhutang, beserta nota yang belum lunas (nomor, tanggal, sisa).
export async function GET() {
  const { error } = await requireApi();
  if (error) return error;
  const customers = await query('SELECT * FROM customers WHERE total_hutang > 0 ORDER BY total_hutang DESC');
  if (!customers.length) return Response.json([]);
  const notas = await query(
    `SELECT s.id, s.nomor, s.customer_id, DATE(s.created_at) AS tanggal,
       s.hutang - s.hutang_terbayar - COALESCE((SELECT SUM(r.hutang_reduced) FROM sale_returns r WHERE r.sale_id = s.id), 0) AS sisa
     FROM sales s WHERE s.status = 'lunas' AND s.hutang > 0 AND s.customer_id IN (?)
     HAVING sisa > 0.005 ORDER BY s.created_at, s.id`,
    [customers.map((c) => c.id)]
  );
  return Response.json(customers.map((c) => ({ ...c, notas: notas.filter((n) => n.customer_id === c.id) })));
}

// Bayar hutang tanpa belanja baru.
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const { customer_id, amount, metode } = await req.json();
  const amt = Number(amount);
  const c = await queryOne('SELECT * FROM customers WHERE id = ?', [customer_id]);
  if (!c) return Response.json({ error: 'Pembeli tidak ditemukan' }, { status: 404 });
  if (!(amt > 0) || amt > c.total_hutang) {
    return Response.json({ error: 'Jumlah tidak valid (maks sesuai sisa hutang)' }, { status: 400 });
  }
  await tx(async (q) => {
    await bayarHutang(q, c.id, amt, session.uid);
    // Hanya pembayaran tunai yang masuk laci; e-wallet dan transfer tidak.
    if (!metode || metode === 'cash') {
      await catatDompet(q, { dompet: 'laci', jumlah: amt, jenis: 'bayar_hutang', keterangan: c.name, userId: session.uid });
    }
  });
  return Response.json({ ok: true });
}

// Perbarui kontak pembeli (nomor WA / alamat), atau tandai pembeli dikenal (tier B). Tercatat di catatan perubahan.
export async function PATCH(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  await tx(async (q) => {
    const [c] = await q('SELECT * FROM customers WHERE id = ? FOR UPDATE', [b.id]);
    if (!c) return;
    const baru = b.dikenal !== undefined ? { dikenal: b.dikenal ? 1 : 0 } : { phone: b.phone || null, address: b.address || null };
    await q(`UPDATE customers SET ${Object.keys(baru).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...Object.values(baru), c.id]);
    await catatBeda(q, { userId: session.uid, objek: 'pembeli', objekId: c.id, lama: c, baru });
  });
  return Response.json({ ok: true });
}
