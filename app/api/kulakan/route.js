import { query } from '@/lib/db';
import { requireApi } from '@/lib/auth';

// Barang yang perlu dikulak: varian berstatus waspada/kritis, dikelompokkan per produk,
// lengkap dengan harga beli terakhir dari tiap supplier aktif (referensi nota).
export async function GET() {
  const { error } = await requireApi();
  if (error) return error;
  const vars = await query(
    `SELECT v.id, v.color, v.stock, v.level_green, v.level_yellow, v.level_red,
            p.id AS product_id, p.name AS product_name, p.category, p.base_unit
     FROM variants v JOIN products p ON p.id = v.product_id
     WHERE p.active = 1 AND v.active = 1 AND v.level_yellow > 0 AND v.stock <= v.level_yellow
     ORDER BY p.category, p.name, v.color`
  );
  if (!vars.length) return Response.json([]);

  const ids = [...new Set(vars.map((v) => v.product_id))];
  const buys = await query(
    `SELECT i.product_id, i.unit_name, i.factor, i.unit_cost, i.purchase_id, p.created_at, p.supplier_id, s.name AS supplier_name
     FROM purchase_items i JOIN purchases p ON p.id = i.purchase_id JOIN suppliers s ON s.id = p.supplier_id
     WHERE s.active = 1 AND i.product_id IN (?) AND p.retur_supplier_id IS NULL
     ORDER BY p.created_at DESC, i.id DESC`,
    [ids]
  );

  const out = new Map();
  for (const v of vars) {
    if (!out.has(v.product_id)) {
      out.set(v.product_id, { product_id: v.product_id, product_name: v.product_name, category: v.category, base_unit: v.base_unit, variants: [], suppliers: [] });
    }
    out.get(v.product_id).variants.push({
      id: v.id, color: v.color, stock: v.stock, level_green: v.level_green, level_yellow: v.level_yellow,
      status: v.stock <= v.level_red ? 'red' : 'yellow',
    });
  }
  const seen = new Set();
  for (const b of buys) {
    const key = `${b.product_id}:${b.supplier_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.get(b.product_id)?.suppliers.push({
      supplier_id: b.supplier_id, supplier_name: b.supplier_name, unit_name: b.unit_name, factor: b.factor, unit_cost: b.unit_cost,
      purchase_id: b.purchase_id, date: b.created_at,
    });
  }
  const list = [...out.values()];
  // Yang ada varian kritis ditaruh paling atas.
  list.sort((a, b) => b.variants.some((v) => v.status === 'red') - a.variants.some((v) => v.status === 'red'));
  return Response.json(list);
}
