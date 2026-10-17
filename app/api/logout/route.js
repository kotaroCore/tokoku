import { query } from '@/lib/db';
import { getSession, clearSession } from '@/lib/auth';

export async function POST(req) {
  const s = await getSession();
  // ?idle=1: logout otomatis karena diam. Sesi diakhiri tetapi shift tetap berjalan.
  if (new URL(req.url).searchParams.get('idle') === '1') {
    if (s?.shiftId) await query('UPDATE shifts SET idle_out = 1 WHERE id = ?', [s.shiftId]);
  } else if (s?.shiftId) {
    await query('UPDATE shifts SET ended_at = NOW() WHERE id = ? AND ended_at IS NULL', [s.shiftId]);
  }
  await clearSession();
  return Response.json({ ok: true });
}
