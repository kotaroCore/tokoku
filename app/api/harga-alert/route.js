import { query, tx } from '@/lib/db';
import { requireApi, requireIzinApi } from '@/lib/auth';
import { BadRequest } from '@/lib/sales';
import { catat } from '@/lib/catatan';
import { galat } from '@/lib/galat';

// Peringatan perubahan harga beli yang belum ditutup admin.
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

// Admin (atau staf berizin ubah modal) menutup peringatan:
// "ubah" = harga beli baru dipakai (bila belum) lalu harga jual ditinjau di halaman produk; "tidak_perlu" = harga beli tetap.
export async function POST(req) {
  const { session, error } = await requireIzinApi('ubah_modal');
  if (error) return error;
  const b = await req.json();
  const status = b.aksi === 'ubah' ? 'diubah' : b.aksi === 'tidak_perlu' ? 'tidak_perlu' : null;
  if (!status) return Response.json({ error: 'Aksi tidak dikenal' }, { status: 400 });

  try {
    await tx(async (q) => {
      const [h] = await q("SELECT * FROM harga_alert WHERE id = ? AND status = 'terbuka' FOR UPDATE", [Number(b.id)]);
      if (!h) throw new BadRequest('Peringatan tidak ditemukan atau sudah ditutup');
      if (status === 'diubah' && !h.modal_diubah) {
        const [p] = await q('SELECT cost FROM products WHERE id = ? FOR UPDATE', [h.product_id]);
        await q('UPDATE products SET cost = ? WHERE id = ?', [h.baru, h.product_id]);
        await q('UPDATE harga_alert SET modal_diubah = 1 WHERE id = ?', [h.id]);
        await catat(q, { userId: session.uid, objek: 'produk', objekId: h.product_id, aksi: 'ubah', lama: { cost: p.cost }, baru: { cost: h.baru, sumber: `peringatan harga #${h.id}` } });
      }
      await q('UPDATE harga_alert SET status = ?, diselesaikan_oleh = ?, diselesaikan_pada = NOW() WHERE id = ?', [status, session.uid, h.id]);
    });
    return Response.json({ ok: true });
  } catch (e) {
    return galat(e);
  }
}
