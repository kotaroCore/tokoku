import { query, queryOne, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';

// Penyesuaian stok (delta dalam satuan dasar) dan/atau pengaturan level reorder.
export async function PATCH(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const v = await queryOne('SELECT * FROM variants WHERE id = ?', [b.id]);
  if (!v) return Response.json({ error: 'Varian tidak ditemukan' }, { status: 404 });
  await tx(async (q) => {
    const delta = Number(b.delta) || 0;
    if (delta) {
      await q('UPDATE variants SET stock = stock + ? WHERE id = ?', [delta, v.id]);
      await q('INSERT INTO stock_adjustments (variant_id, user_id, delta, note) VALUES (?, ?, ?, ?)', [
        v.id, session.uid, delta, b.note || null,
      ]);
    }
    if (b.level_green != null) {
      await q('UPDATE variants SET level_green = ?, level_yellow = ?, level_red = ? WHERE id = ?', [
        Number(b.level_green) || 0, Number(b.level_yellow) || 0, Number(b.level_red) || 0, v.id,
      ]);
    }
  });
  return Response.json({ ok: true });
}

export async function POST(req) {
  const { error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const r = await query(
    'INSERT INTO variants (product_id, color, stock, level_green, level_yellow, level_red) VALUES (?, ?, ?, ?, ?, ?)',
    [b.product_id, (b.color || '').trim(), Number(b.stock) || 0, Number(b.level_green) || 0, Number(b.level_yellow) || 0, Number(b.level_red) || 0]
  );
  return Response.json({ ok: true, id: r.insertId });
}
