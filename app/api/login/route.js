import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { createSession } from '@/lib/auth';

export async function POST(req) {
  const { username, password } = await req.json();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim());
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return Response.json({ error: 'Username atau password salah' }, { status: 401 });
  }
  const shift = db.prepare('INSERT INTO shifts (user_id) VALUES (?)').run(user.id);
  await createSession({ uid: user.id, name: user.name, shiftId: Number(shift.lastInsertRowid) });
  return Response.json({ ok: true });
}
