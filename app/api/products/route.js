import { db } from '@/lib/db';
import { requireApi } from '@/lib/auth';

export async function GET() {
  const { error } = await requireApi();
  if (error) return error;
  const products = db.prepare('SELECT * FROM products ORDER BY category, name').all();
  const units = db.prepare('SELECT * FROM units ORDER BY factor').all();
  const variants = db.prepare('SELECT * FROM variants ORDER BY color').all();
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
  const tx = db.transaction(() => {
    const p = db
      .prepare('INSERT INTO products (category, name, base_unit) VALUES (?, ?, ?)')
      .run(b.category.trim().toUpperCase(), b.name.trim(), b.base_unit?.trim() || 'biji');
    const pid = p.lastInsertRowid;
    for (const u of units) {
      db.prepare('INSERT INTO units (product_id, name, factor, price) VALUES (?, ?, ?, ?)').run(
        pid, u.name.trim(), Number(u.factor) || 1, Number(u.price)
      );
    }
    for (const v of variants) {
      db.prepare(
        'INSERT INTO variants (product_id, color, stock, level_green, level_yellow, level_red) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(pid, (v.color || '').trim(), Number(v.stock) || 0, Number(v.level_green) || 0, Number(v.level_yellow) || 0, Number(v.level_red) || 0);
    }
    return pid;
  });
  return Response.json({ ok: true, id: Number(tx()) });
}
