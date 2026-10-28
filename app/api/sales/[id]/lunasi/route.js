import { tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { BadRequest, lunasiNota } from '@/lib/sales';

// Melunasi nota draf: stok berkurang, hutang dan pembayaran hutang lama dicatat.
export async function POST(req, { params }) {
  const { session, error } = await requireApi();
  if (error) return error;
  const id = Number((await params).id);
  if (!(id > 0)) return Response.json({ error: 'Nota tidak ditemukan' }, { status: 404 });

  try {
    const result = await tx((q) => lunasiNota(q, id, session.uid));
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}
