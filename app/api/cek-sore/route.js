import { query, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { BadRequest } from '@/lib/sales';
import { cekSoreAlokasi } from '@/lib/stok';

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
  try {
    await tx((q) => cekSoreAlokasi(q, { productId: b.product_id, userId: session.uid, allocations: b.allocations }));
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}
