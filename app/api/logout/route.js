import { query } from '@/lib/db';
import { getSession, clearSession } from '@/lib/auth';

export async function POST() {
  const s = await getSession();
  if (s?.shiftId) {
    await query('UPDATE shifts SET ended_at = NOW() WHERE id = ? AND ended_at IS NULL', [s.shiftId]);
  }
  await clearSession();
  return Response.json({ ok: true });
}
