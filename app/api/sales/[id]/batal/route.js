import { tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { BadRequest, batalkanNota } from '@/lib/sales';

// Membatalkan nota draf dengan alasan. Nota tetap tersimpan dengan status batal.
export async function POST(req, { params }) {
  const { session, error } = await requireApi();
  if (error) return error;
  const id = Number((await params).id);
  if (!(id > 0)) return Response.json({ error: 'Nota tidak ditemukan' }, { status: 404 });
  const b = await req.json();

  try {
    const result = await tx((q) => batalkanNota(q, id, session.uid, b.alasan));
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}
