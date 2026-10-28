import { queryOne, query, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { BadRequest, buatNota, lunasiNota } from '@/lib/sales';

// Kasir menyimpan nota: langsung lunas, atau draf bila { draft: true } (stok belum berkurang).
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();

  try {
    const result = await tx(async (q) => {
      const nota = await buatNota(q, {
        userId: session.uid,
        shiftId: session.shiftId,
        items: b.items || [],
        channel: b.channel,
        customerName: (b.customer_name || '').trim(),
        customerPhone: b.customer_phone,
        customerAddress: b.customer_address,
        paidCash: Number(b.paid_cash) || 0,
        paidEwallet: Number(b.paid_ewallet) || 0,
        paidTransfer: Number(b.paid_transfer) || 0,
        paidSaldo: Number(b.paid_saldo) || 0,
        payDebt: Number(b.pay_old_debt) || 0,
      });
      if (b.draft) return { ...nota, status: 'draft' };
      const lunas = await lunasiNota(q, nota.saleId, session.uid);
      return { ...nota, status: 'lunas', sisaHutang: lunas.sisaHutang };
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}

export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const params = new URL(req.url).searchParams;
  const id = params.get('id');

  // Tanpa id: daftar nota per tanggal (untuk halaman Riwayat). Nota draf dan batal ikut tampil dengan statusnya.
  if (!id) {
    const date = params.get('date') || new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const rows = await query(
      `SELECT s.id, s.nomor, s.status, s.created_at, s.total, s.hutang, s.channel, u.name AS kasir, c.name AS customer_name,
         (SELECT COALESCE(SUM(r.total),0) FROM sale_returns r WHERE r.sale_id = s.id) AS retur
       FROM sales s JOIN users u ON u.id = s.user_id LEFT JOIN customers c ON c.id = s.customer_id
       WHERE DATE(s.created_at) = ? ORDER BY s.id DESC`,
      [date]
    );
    return Response.json(rows);
  }

  const sale = await queryOne(
    `SELECT s.*, u.name AS kasir, c.name AS customer_name, c.total_hutang AS customer_hutang, c.last_hutang_date
     FROM sales s JOIN users u ON u.id = s.user_id LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`,
    [id]
  );
  if (!sale) return Response.json({ error: 'Nota tidak ditemukan' }, { status: 404 });
  const items = await query(
    `SELECT i.*, COALESCE((SELECT SUM(qty) FROM sale_return_items WHERE sale_item_id = i.id),0) AS returned_qty
     FROM sale_items i WHERE i.sale_id = ?`,
    [id]
  );
  const returns = await query(
    'SELECT r.*, u.name AS kasir FROM sale_returns r JOIN users u ON u.id = r.user_id WHERE r.sale_id = ? ORDER BY r.id',
    [id]
  );
  return Response.json({ ...sale, items, returns });
}
