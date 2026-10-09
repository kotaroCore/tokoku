import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { queryOne } from '@/lib/db';

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
async function liveSession() {
  const s = await getSession();
  if (!s) return null;
  const u = await queryOne('SELECT name, role, active FROM users WHERE id = ?', [s.uid]);
  if (!u || !u.active) return null;
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
