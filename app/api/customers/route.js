import { query } from '@/lib/db';
import { requireApi } from '@/lib/auth';

export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const q = new URL(req.url).searchParams.get('q')?.trim() || '';
  const rows = q
    ? await query('SELECT * FROM customers WHERE name LIKE ? ORDER BY name LIMIT 10', [`%${q}%`])
    : await query('SELECT * FROM customers ORDER BY name LIMIT 100');
  return Response.json(rows);
}
