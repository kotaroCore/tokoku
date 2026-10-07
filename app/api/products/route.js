import { query, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';

export async function GET() {
  const { error } = await requireApi();
  if (error) return error;
  const products = await query('SELECT * FROM products ORDER BY category, name');
  const units = await query('SELECT * FROM units ORDER BY factor');
  const variants = await query('SELECT * FROM variants ORDER BY color');
  return Response.json(
    products.map((p) => ({
      ...p,
      units: units.filter((u) => u.product_id === p.id),
      variants: variants.filter((v) => v.product_id === p.id),
    }))
  );
}

export async function POST(req) {
  const { error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  if (!b.name?.trim() || !b.category?.trim()) {
    return Response.json({ error: 'Kategori dan nama wajib diisi' }, { status: 400 });
  }
  const units = (b.units || []).filter((u) => u.name?.trim() && Number(u.price) >= 0);
  if (!units.length) return Response.json({ error: 'Minimal satu satuan jual' }, { status: 400 });
  const variants = b.variants?.length ? b.variants : [{ color: '' }];
  const id = await tx(async (q) => {
    const p = await q('INSERT INTO products (category, name, base_unit) VALUES (?, ?, ?)', [
      b.category.trim().toUpperCase(), b.name.trim(), b.base_unit?.trim() || 'biji',
    ]);
    for (const u of units) {
      await q('INSERT INTO units (product_id, name, factor, price) VALUES (?, ?, ?, ?)', [
        p.insertId, u.name.trim(), Number(u.factor) || 1, Number(u.price),
      ]);
    }
    for (const v of variants) {
      await q(
        'INSERT INTO variants (product_id, color, stock, level_green, level_yellow, level_red) VALUES (?, ?, ?, ?, ?, ?)',
        [p.insertId, (v.color || '').trim(), Number(v.stock) || 0, Number(v.level_green) || 0, Number(v.level_yellow) || 0, Number(v.level_red) || 0]
      );
    }
    return p.insertId;
  });
  return Response.json({ ok: true, id });
}
