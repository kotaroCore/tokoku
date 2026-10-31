import { tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { prosesRetur } from '@/lib/returns';
import { galat } from '@/lib/galat';

// Retur sebagian atau seluruh barang dari satu nota (aturan lengkap di lib/returns.js).
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  try {
    const result = await tx((q) => prosesRetur(q, { userId: session.uid, shiftId: session.shiftId }, b));
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return galat(e);
  }
}
