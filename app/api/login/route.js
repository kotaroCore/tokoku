import bcrypt from 'bcryptjs';
import { query, queryOne } from '@/lib/db';
import { createSession } from '@/lib/auth';

export async function POST(req) {
  const { username, password } = await req.json();
  const user = await queryOne('SELECT * FROM users WHERE username = ?', [String(username || '').trim()]);
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return Response.json({ error: 'Username atau password salah' }, { status: 401 });
  }
  if (!user.active) {
    return Response.json({ error: 'Akun dinonaktifkan. Hubungi admin.' }, { status: 403 });
  }
  // Shift yang sesinya mati karena diam (logout otomatis) dilanjutkan bila masih hari yang sama.
  const open = await queryOne(
    'SELECT id, DATE(started_at) = CURDATE() AS today FROM shifts WHERE user_id = ? AND ended_at IS NULL AND idle_out = 1 ORDER BY id DESC LIMIT 1',
    [user.id]
  );
  let shiftId;
  if (open?.today) {
    shiftId = open.id;
    await query('UPDATE shifts SET idle_out = 0, last_active = NOW(), busy_at = NULL, busy_notified = 0 WHERE id = ?', [shiftId]);
  } else {
    if (open) await query('UPDATE shifts SET ended_at = COALESCE(last_active, NOW()) WHERE id = ?', [open.id]);
    shiftId = (await query('INSERT INTO shifts (user_id, last_active) VALUES (?, NOW())', [user.id])).insertId;
  }
  await createSession({ uid: user.id, name: user.name, shiftId });
  return Response.json({ ok: true });
}
