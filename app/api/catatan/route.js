import { query } from '@/lib/db';
import { requireRoleApi } from '@/lib/auth';
import { OBJEK } from '@/lib/catatan';

const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

// Catatan perubahan (khusus admin). Saring per objek, per pengguna, dan rentang tanggal.
export async function GET(req) {
  const { error } = await requireRoleApi('admin');
  if (error) return error;
  const sp = new URL(req.url).searchParams;
  const where = [];
  const params = [];
  const objek = sp.get('objek');
  if (objek && OBJEK.includes(objek)) { where.push('c.objek = ?'); params.push(objek); }
  const userId = Number(sp.get('user_id'));
  if (userId > 0) { where.push('c.user_id = ?'); params.push(userId); }
  const from = sp.get('from');
  const to = sp.get('to');
  if (from && TANGGAL.test(from)) { where.push('DATE(c.dibuat_pada) >= ?'); params.push(from); }
  if (to && TANGGAL.test(to)) { where.push('DATE(c.dibuat_pada) <= ?'); params.push(to); }
  const rows = await query(
    `SELECT c.*, u.name AS oleh FROM catatan_perubahan c JOIN users u ON u.id = c.user_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.id DESC LIMIT 500`,
    params
  );
  const parse = (x) => { try { return x ? JSON.parse(x) : null; } catch { return x; } };
  return Response.json(rows.map((r) => ({ ...r, lama: parse(r.lama), baru: parse(r.baru) })));
}
