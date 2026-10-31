import { tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { BadRequest } from '@/lib/sales';
import { ubahStatusPembelian } from '@/lib/purchases';

// Ubah status kiriman: dalam perjalanan -> diterima (harga beli diperbarui) atau hilang.
// Barang yang sudah diterima tidak bisa ditandai hilang; koreksinya lewat stok.
export async function PATCH(req, { params }) {
  const { session, error } = await requireApi();
  if (error) return error;
  const id = Number((await params).id);
  if (!(id > 0)) return Response.json({ error: 'Pembelian tidak ditemukan' }, { status: 404 });
  const b = await req.json();

  try {
    await tx((q) => ubahStatusPembelian(q, id, b.status, { userId: session.uid, isOwner: session.role === 'owner' }));
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}
