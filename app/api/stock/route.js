import { query } from '@/lib/db';
import { requireApi } from '@/lib/auth';

function stockStatus(v) {
  if (!v.level_green && !v.level_yellow && !v.level_red) return 'none';
  if (v.stock <= v.level_red) return 'red';
  if (v.stock <= v.level_yellow) return 'yellow';
  if (v.stock <= v.level_green) return 'green';
  return 'ok';
}

export async function GET() {
  const { error } = await requireApi();
  if (error) return error;
  const rows = await query(
    `SELECT v.*, p.name AS product_name, p.category, p.base_unit
     FROM variants v JOIN products p ON p.id = v.product_id ORDER BY p.category, p.name, v.color`
  );
  return Response.json(rows.map((v) => ({ ...v, status: stockStatus(v) })));
}
