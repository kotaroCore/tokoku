import { tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { BadRequest } from '@/lib/sales';
import { terimaBarang } from '@/lib/purchases';

// Ubah status kiriman: dalam perjalanan -> diterima (harga beli diperbarui) atau hilang.
// Barang yang sudah diterima tidak bisa ditandai hilang; koreksinya lewat stok.
export async function PATCH(req, { params }) {
  const { session, error } = await requireApi();
  if (error) return error;
  const id = Number((await params).id);
  if (!(id > 0)) return Response.json({ error: 'Pembelian tidak ditemukan' }, { status: 404 });
  const b = await req.json();

  try {
    await tx(async (q) => {
      const [pu] = await q('SELECT * FROM purchases WHERE id = ? FOR UPDATE', [id]);
      if (!pu) throw new BadRequest('Pembelian tidak ditemukan');
      if (pu.status !== 'dalam_perjalanan') throw new BadRequest(`Status sudah ${pu.status}`);
      if (b.status === 'diterima') {
        await q("UPDATE purchases SET status = 'diterima' WHERE id = ?", [id]);
        await terimaBarang(q, id, session.uid, session.role === 'owner');
      } else if (b.status === 'hilang') {
        await q("UPDATE purchases SET status = 'hilang' WHERE id = ?", [id]);
      } else {
        throw new BadRequest('Status tidak dikenal');
      }
    });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}
