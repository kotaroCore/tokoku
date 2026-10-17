import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { query, queryOne } from '@/lib/db';
import { getSettings, idleConfig, pastClosing } from '@/lib/settings';

const COOKIE = 'tokoku_session';
const secret = () =>
  new TextEncoder().encode(process.env.SESSION_SECRET || 'dev-only-secret-change-me-please-32chars');

export async function createSession(payload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('12h')
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
}

export async function getSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    return (await jwtVerify(token, secret())).payload;
  } catch {
    return null;
  }
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

// Data pengguna diambil dari database di setiap request, jadi akun yang dinonaktifkan
// atau diubah perannya langsung berlaku walau cookie login masih ada.
// Sesi juga mati bila tidak ada aktivitas melebihi batas yang diatur owner (kecuali sedang transaksi,
// dan hanya sampai jam tutup). Shift tidak diakhiri: login berikutnya melanjutkan shift yang sama.
async function liveSession() {
  const s = await getSession();
  if (!s) return null;
  const u = await queryOne(
    `SELECT u.name, u.role, u.active, sh.id AS sid,
            TIMESTAMPDIFF(SECOND, sh.last_active, NOW()) AS idle_s,
            TIMESTAMPDIFF(SECOND, sh.busy_at, NOW()) AS busy_s
     FROM users u LEFT JOIN shifts sh ON sh.id = ? WHERE u.id = ?`,
    [s.shiftId || 0, s.uid]
  );
  if (!u || !u.active) return null;
  if (u.sid && u.idle_s != null) {
    const cfg = idleConfig(await getSettings());
    // +60 detik toleransi: pemicu utama ada di browser, server hanya jaring pengaman.
    if (cfg.enabled && u.idle_s > cfg.minutes * 60 + 60) {
      const busy = u.busy_s != null && u.busy_s <= 150 && !pastClosing(cfg.closeTime);
      if (!busy) {
        await query('UPDATE shifts SET idle_out = 1 WHERE id = ?', [u.sid]);
        return null;
      }
    }
  }
  return { ...s, name: u.name, role: u.role };
}

export async function requirePage() {
  const s = await liveSession();
  if (!s) redirect('/login');
  return s;
}

export async function requireOwnerPage() {
  const s = await requirePage();
  if (s.role !== 'owner') redirect('/');
  return s;
}

export async function requireApi() {
  const s = await liveSession();
  if (!s) return { error: Response.json({ error: 'Belum login atau akun dinonaktifkan' }, { status: 401 }) };
  return { session: s };
}

export async function requireOwnerApi() {
  const r = await requireApi();
  if (r.error) return r;
  if (r.session.role !== 'owner') return { error: Response.json({ error: 'Hanya owner yang boleh' }, { status: 403 }) };
  return r;
}
