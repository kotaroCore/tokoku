import { db } from '@/lib/db';
import { getSession, clearSession } from '@/lib/auth';

export async function POST() {
  const s = await getSession();
  if (s?.shiftId) {
    db.prepare("UPDATE shifts SET ended_at = datetime('now','localtime') WHERE id = ? AND ended_at IS NULL").run(s.shiftId);
  }
  await clearSession();
  return Response.json({ ok: true });
}
