import { query, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';

class BadRequest extends Error {}

// Barang terjual yang warnanya diambil otomatis dan belum dicek, per produk.
export async function GET() {
  const { error } = await requireApi();
  if (error) return error;
  const rows = await query(
    `SELECT i.id, i.qty, i.factor, i.variant_id, i.sale_id, v.color, v.product_id, p.name AS product_name, p.base_unit
     FROM sale_items i JOIN sales s ON s.id = i.sale_id AND s.status = 'lunas'
       JOIN variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id
     WHERE i.auto_pick = 1 AND i.auto_resolved = 0 ORDER BY p.name, i.id`
  );
  const byProduct = new Map();
  for (const r of rows) {
    if (!byProduct.has(r.product_id)) {
      byProduct.set(r.product_id, { product_id: r.product_id, product_name: r.product_name, base_unit: r.base_unit, total: 0, taken: new Map() });
    }
    const g = byProduct.get(r.product_id);
    const amt = r.qty * r.factor;
    g.total += amt;
    g.taken.set(r.color, (g.taken.get(r.color) || 0) + amt);
  }
  const ids = [...byProduct.keys()];
  const variants = ids.length
    ? await query('SELECT id, product_id, color, stock FROM variants WHERE active = 1 AND product_id IN (?) ORDER BY color', [ids])
    : [];
  return Response.json([...byProduct.values()].map((g) => ({
    ...g,
    taken: [...g.taken].map(([color, qty]) => ({ color, qty })),
    variants: variants.filter((v) => v.product_id === g.product_id),
  })));
}

// Cek sore: stok yang diambil otomatis dikembalikan dulu, lalu dipotong dari warna sebenarnya (allocations).
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const alloc = (b.allocations || []).map((a) => ({ variant_id: Number(a.variant_id), qty: Number(a.qty) })).filter((a) => a.qty > 0);
  try {
    await tx(async (q) => {
      const items = await q(
        `SELECT i.* FROM sale_items i JOIN sales s ON s.id = i.sale_id AND s.status = 'lunas'
         JOIN variants v ON v.id = i.variant_id
         WHERE i.auto_pick = 1 AND i.auto_resolved = 0 AND v.product_id = ? FOR UPDATE`,
        [b.product_id]
      );
      if (!items.length) throw new BadRequest('Tidak ada barang yang perlu dicek untuk produk ini');
      const total = items.reduce((s, i) => s + i.qty * i.factor, 0);
      const sum = alloc.reduce((s, a) => s + a.qty, 0);
      if (Math.abs(sum - total) > 1e-6) throw new BadRequest(`Jumlah per warna (${sum}) harus sama dengan total terjual (${total})`);
      for (const i of items) {
        await q('UPDATE variants SET stock = stock + ? WHERE id = ?', [i.qty * i.factor, i.variant_id]);
        await q('INSERT INTO stock_adjustments (variant_id, user_id, delta, note) VALUES (?, ?, ?, ?)', [
          i.variant_id, session.uid, i.qty * i.factor, `Cek sore: kembalikan stok otomatis nota #${i.sale_id}`,
        ]);
      }
      for (const a of alloc) {
        const [v] = await q('SELECT * FROM variants WHERE id = ? AND product_id = ? FOR UPDATE', [a.variant_id, b.product_id]);
        if (!v || !v.active) throw new BadRequest('Warna tidak valid');
        if (v.stock < a.qty - 1e-9) throw new BadRequest(`Stok ${v.color || 'tanpa warna'} tidak cukup (sisa ${v.stock})`);
        await q('UPDATE variants SET stock = stock - ? WHERE id = ?', [a.qty, v.id]);
        await q('INSERT INTO stock_adjustments (variant_id, user_id, delta, note) VALUES (?, ?, ?, ?)', [
          v.id, session.uid, -a.qty, 'Cek sore: warna sebenarnya terjual',
        ]);
      }
      await q('UPDATE sale_items SET auto_resolved = 1 WHERE id IN (?)', [items.map((i) => i.id)]);
    });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}
