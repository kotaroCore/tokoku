import { query, tx } from '@/lib/db';
import { requireApi, requireOwnerApi } from '@/lib/auth';
import { BadRequest } from '@/lib/sales';

// Peringatan perubahan harga beli yang belum ditutup owner.
export async function GET() {
  const { error } = await requireApi();
  if (error) return error;
  const rows = await query(
    `SELECT h.*, p.name AS product_name, p.base_unit, p.id AS product_id, u.name AS dibuat_oleh_nama
     FROM harga_alert h JOIN products p ON p.id = h.product_id JOIN users u ON u.id = h.dibuat_oleh
     WHERE h.status = 'terbuka' ORDER BY h.id`
  );
  return Response.json(rows);
}

// Owner menutup peringatan: "ubah" (harga jual diubah di halaman produk) atau "tidak_perlu".
export async function POST(req) {
  const { session, error } = await requireOwnerApi();
  if (error) return error;
  const b = await req.json();
  const status = b.aksi === 'ubah' ? 'diubah' : b.aksi === 'tidak_perlu' ? 'tidak_perlu' : null;
  if (!status) return Response.json({ error: 'Aksi tidak dikenal' }, { status: 400 });

  try {
    await tx(async (q) => {
      const [h] = await q("SELECT * FROM harga_alert WHERE id = ? AND status = 'terbuka' FOR UPDATE", [Number(b.id)]);
      if (!h) throw new BadRequest('Peringatan tidak ditemukan atau sudah ditutup');
      await q('UPDATE harga_alert SET status = ?, diselesaikan_oleh = ?, diselesaikan_pada = NOW() WHERE id = ?', [status, session.uid, h.id]);
    });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}
