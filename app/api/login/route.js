import bcrypt from 'bcryptjs';
import { query, queryOne } from '@/lib/db';
import { createSession } from '@/lib/auth';

export async function POST(req) {
  const { username, password } = await req.json();
  const user = await queryOne('SELECT * FROM users WHERE username = ?', [String(username || '').trim()]);
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return Response.json({ error: 'Username atau password salah' }, { status: 401 });
  }
  const shift = await query('INSERT INTO shifts (user_id) VALUES (?)', [user.id]);
  await createSession({ uid: user.id, name: user.name, shiftId: shift.insertId });
  return Response.json({ ok: true });
}
