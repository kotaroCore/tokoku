import bcrypt from 'bcryptjs';
import { query, queryOne, tx } from '@/lib/db';
import { requireRoleApi } from '@/lib/auth';
import { ROLES, IZIN } from '@/lib/izin';
import { catat, catatBeda } from '@/lib/catatan';
import { BadRequest } from '@/lib/sales';
import { galat } from '@/lib/galat';

const bad = (error) => Response.json({ error }, { status: 400 });

// Hanya admin. Pengguna tidak pernah dihapus, hanya dinonaktifkan, agar riwayat nota/shift tetap utuh.
export async function GET() {
  const { error } = await requireRoleApi('admin');
  if (error) return error;
  const rows = await query(
    `SELECT u.id, u.username, u.name, u.role, u.active,
       (SELECT MAX(started_at) FROM shifts WHERE user_id = u.id) AS last_login
     FROM users u ORDER BY u.active DESC, u.role, u.name`
  );
  const izin = await query('SELECT user_id, izin FROM izin_pengguna');
  return Response.json(rows.map((u) => ({ ...u, izin: izin.filter((i) => i.user_id === u.id).map((i) => i.izin) })));
}

export async function POST(req) {
  const { session, error } = await requireRoleApi('admin');
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
  const id = await tx(async (q) => {
    const r = await q('INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)', [
      username, name, bcrypt.hashSync(password, 10), role,
    ]);
    await catat(q, { userId: session.uid, objek: 'pengguna', objekId: r.insertId, aksi: 'tambah', baru: { username, name, role } });
    return r.insertId;
  });
  return Response.json({ ok: true, id });
}

// Ubah nama, peran, status aktif, reset password, atau beri / cabut izin ({ izin, beri: true|false }).
export async function PATCH(req) {
  const { session, error } = await requireRoleApi('admin');
  if (error) return error;
  const b = await req.json();
  const u = await queryOne('SELECT * FROM users WHERE id = ?', [b.id]);
  if (!u) return Response.json({ error: 'Pengguna tidak ditemukan' }, { status: 404 });

  if (b.izin != null) {
    if (!(b.izin in IZIN)) return bad('Izin tidak dikenal');
    if (u.role === 'admin') return bad('Admin sudah boleh semua; izin hanya untuk staf');
    try {
      await tx(async (q) => {
        const [ada] = await q('SELECT 1 FROM izin_pengguna WHERE user_id = ? AND izin = ?', [u.id, b.izin]);
        if (b.beri && !ada) {
          await q('INSERT INTO izin_pengguna (user_id, izin, diberi_oleh) VALUES (?, ?, ?)', [u.id, b.izin, session.uid]);
          await catat(q, { userId: session.uid, objek: 'izin', objekId: u.id, aksi: 'beri_izin', baru: { pengguna: u.name, izin: b.izin } });
        } else if (!b.beri && ada) {
          await q('DELETE FROM izin_pengguna WHERE user_id = ? AND izin = ?', [u.id, b.izin]);
          await catat(q, { userId: session.uid, objek: 'izin', objekId: u.id, aksi: 'cabut_izin', lama: { pengguna: u.name, izin: b.izin } });
        }
      });
      return Response.json({ ok: true });
    } catch (e) {
      return galat(e);
    }
  }

  const name = b.name != null ? String(b.name).trim() : u.name;
  const role = b.role != null ? b.role : u.role;
  const active = b.active != null ? (b.active ? 1 : 0) : u.active;
  if (!name) return bad('Nama wajib diisi');
  if (!ROLES.includes(role)) return bad('Peran tidak valid');
  if (b.password != null && String(b.password).length < 6) return bad('Password minimal 6 karakter');
  if (u.id === session.uid && !active) return bad('Kamu tidak bisa menonaktifkan akunmu sendiri');

  try {
    await tx(async (q) => {
      // Minimal satu admin aktif harus selalu ada. Dicek di dalam transaksi (baris admin dikunci).
      const kehilanganAdmin = u.role === 'admin' && u.active && (role !== 'admin' || !active);
      if (kehilanganAdmin) {
        if (u.id === session.uid) throw new BadRequest('Kamu tidak bisa menonaktifkan atau menurunkan akunmu sendiri');
        const lain = await q("SELECT id FROM users WHERE role = 'admin' AND active = 1 AND id <> ? FOR UPDATE", [u.id]);
        if (!lain.length) throw new BadRequest('Harus ada minimal satu admin aktif');
      }
      await q('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?', [name, role, active, u.id]);
      if (b.password != null) await q('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(String(b.password), 10), u.id]);
      if (u.active && !active) await q('UPDATE shifts SET ended_at = NOW() WHERE user_id = ? AND ended_at IS NULL', [u.id]);
      const aksi = u.active !== active ? (active ? 'aktif' : 'nonaktif') : 'ubah';
      const d = await catatBeda(q, { userId: session.uid, objek: 'pengguna', objekId: u.id, aksi, lama: u, baru: { name, role, active }, keys: ['name', 'role', 'active'] });
      if (!d && b.password != null) await catat(q, { userId: session.uid, objek: 'pengguna', objekId: u.id, aksi: 'ubah', baru: { password: 'direset' } });
    });
    return Response.json({ ok: true });
  } catch (e) {
    return galat(e);
  }
}
