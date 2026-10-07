import { db } from '@/lib/db';
import { requireApi } from '@/lib/auth';

export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const q = new URL(req.url).searchParams.get('q')?.trim() || '';
  const rows = q
    ? db.prepare('SELECT * FROM customers WHERE name LIKE ? ORDER BY name LIMIT 10').all(`%${q}%`)
    : db.prepare('SELECT * FROM customers ORDER BY name LIMIT 100').all();
  return Response.json(rows);
}
