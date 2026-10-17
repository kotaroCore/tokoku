import { query } from '@/lib/db';
import { requireOwnerApi } from '@/lib/auth';

// Pesan untuk owner yang belum dibaca (ditampilkan sebagai pop-up).
export async function GET() {
  const { error } = await requireOwnerApi();
  if (error) return error;
  const rows = await query('SELECT id, kind, message, created_at FROM notices WHERE seen = 0 ORDER BY id DESC LIMIT 20');
  return Response.json(rows);
}

export async function POST(req) {
  const { error } = await requireOwnerApi();
  if (error) return error;
  const { ids } = await req.json();
  const clean = Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger) : [];
  if (clean.length) await query('UPDATE notices SET seen = 1 WHERE id IN (?)', [clean]);
  return Response.json({ ok: true });
}
