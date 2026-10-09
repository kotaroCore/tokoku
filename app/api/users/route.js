import bcrypt from 'bcryptjs';
import { query, queryOne, tx } from '@/lib/db';
import { requireOwnerApi } from '@/lib/auth';

const ROLES = ['owner', 'staff'];
const bad = (error) => Response.json({ error }, { status: 400 });

// Hanya owner. Pengguna tidak pernah dihapus, hanya dinonaktifkan, agar riwayat nota/shift tetap utuh.
export async function GET() {
  const { error } = await requireOwnerApi();
  if (error) return error;
  const rows = await query(
    `SELECT u.id, u.username, u.name, u.role, u.active,
       (SELECT MAX(started_at) FROM shifts WHERE user_id = u.id) AS last_login
     FROM users u ORDER BY u.active DESC, u.role, u.name`
  );
  return Response.json(rows);
}

export async function POST(req) {
  const { error } = await requireOwnerApi();
  if (error) return error;
  const b = await req.json();
  const username = String(b.username || '').trim().toLowerCase();
  const name = String(b.name || '').trim();
  const password = String(b.password || '');
  const role = ROLES.includes(b.role) ? b.role : 'staff';
  if (!/^[a-z0-9._-]{3,50}$/.test(username)) return bad('Username 3-50 karakter: huruf kecil, angka, titik, strip, garis bawah');
  if (!name) return bad('Nama wajib diisi');
  if (password.length < 6) return bad('Password minimal 6 karakter');
  if (await queryOne('SELECT id FROM users WHERE username = ?', [username])) return bad(`Username "${username}" sudah dipakai`);
  const r = await query('INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)', [
    username, name, bcrypt.hashSync(password, 10), role,
  ]);
  return Response.json({ ok: true, id: r.insertId });
}

// Ubah nama, peran, status aktif, atau reset password.
export async function PATCH(req) {
  const { session, error } = await requireOwnerApi();
  if (error) return error;
  const b = await req.json();
  const u = await queryOne('SELECT * FROM users WHERE id = ?', [b.id]);
  if (!u) return Response.json({ error: 'Pengguna tidak ditemukan' }, { status: 404 });

  const name = b.name != null ? String(b.name).trim() : u.name;
  const role = b.role != null ? b.role : u.role;
  const active = b.active != null ? (b.active ? 1 : 0) : u.active;
  if (!name) return bad('Nama wajib diisi');
  if (!ROLES.includes(role)) return bad('Peran tidak valid');
  if (b.password != null && String(b.password).length < 6) return bad('Password minimal 6 karakter');

  const loseOwner = u.role === 'owner' && u.active && (role !== 'owner' || !active);
  if (loseOwner) {
    if (u.id === session.uid) return bad('Kamu tidak bisa menonaktifkan atau menurunkan akunmu sendiri');
    const other = await queryOne("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND active = 1 AND id <> ?", [u.id]);
    if (other.n < 1) return bad('Harus ada minimal satu owner aktif');
  }
  if (u.id === session.uid && !active) return bad('Kamu tidak bisa menonaktifkan akunmu sendiri');

  await tx(async (q) => {
    await q('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?', [name, role, active, u.id]);
    if (b.password != null) await q('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(String(b.password), 10), u.id]);
    if (u.active && !active) await q('UPDATE shifts SET ended_at = NOW() WHERE user_id = ? AND ended_at IS NULL', [u.id]);
  });
  return Response.json({ ok: true });
}
