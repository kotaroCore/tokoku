import { tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { BadRequest } from '@/lib/sales';
import { masukRak } from '@/lib/purchases';

// Masukkan barang dari nota pembelian ke rak, dibagi per warna. Stok tiap warna bertambah.
// Body: { item_id, lines: [{ variant_id, qty, factor? }] }. qty dalam satuan baris itu; factor = isi satuan tsb
// dalam satuan dasar (kosong = satuan yang tertulis di nota), jadi tiap warna boleh memakai satuan berbeda.
// Boleh dicicil, tetapi total yang dirak tidak boleh melebihi jumlah di nota.
export async function POST(req, { params }) {
  const { session, error } = await requireApi();
  if (error) return error;
  const { id } = await params;
  const b = await req.json();

  try {
    const result = await tx((q) => masukRak(q, Number(id), b.item_id, b.lines, session.uid));
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}
