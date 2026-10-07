import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

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

export async function requirePage() {
  const s = await getSession();
  if (!s) redirect('/login');
  return s;
}

export async function requireApi() {
  const s = await getSession();
  if (!s) return { error: Response.json({ error: 'Belum login' }, { status: 401 }) };
  return { session: s };
}
