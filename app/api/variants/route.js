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
    // Nonaktifkan / aktifkan warna. Tidak dihapus agar riwayat nota dan stok tetap utuh.
    if (b.active != null) await q('UPDATE variants SET active = ? WHERE id = ?', [b.active ? 1 : 0, v.id]);
  });
  return Response.json({ ok: true });
}

// Ganti nama warna. Nama tidak boleh kembar dengan warna lain di produk yang sama.
export async function PUT(req) {
  const { error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const v = await queryOne('SELECT * FROM variants WHERE id = ?', [b.id]);
  if (!v) return Response.json({ error: 'Varian tidak ditemukan' }, { status: 404 });
  const color = String(b.color || '').trim();
  if (!color) return Response.json({ error: 'Nama warna wajib diisi' }, { status: 400 });
  const dup = await queryOne('SELECT id FROM variants WHERE product_id = ? AND color = ? AND id <> ?', [v.product_id, color, v.id]);
  if (dup) return Response.json({ error: `Warna "${color}" sudah ada di produk ini` }, { status: 400 });
  await query('UPDATE variants SET color = ? WHERE id = ?', [color, v.id]);
  return Response.json({ ok: true });
}

export async function POST(req) {
  const { error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const dup = await queryOne('SELECT id FROM variants WHERE product_id = ? AND color = ?', [b.product_id, (b.color || '').trim()]);
  if (dup) return Response.json({ error: `Warna "${(b.color || '').trim()}" sudah ada di produk ini` }, { status: 400 });
  const r = await query(
    'INSERT INTO variants (product_id, color, stock, level_green, level_yellow, level_red) VALUES (?, ?, ?, ?, ?, ?)',
    [b.product_id, (b.color || '').trim(), Number(b.stock) || 0, Number(b.level_green) || 0, Number(b.level_yellow) || 0, Number(b.level_red) || 0]
  );
  return Response.json({ ok: true, id: r.insertId });
}
