import { queryOne, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { BadRequest } from '@/lib/sales';
import { koreksiStok } from '@/lib/stok';
import { catat, catatBeda } from '@/lib/catatan';
import { galat } from '@/lib/galat';

// Penyesuaian stok (delta dalam satuan dasar) dan/atau pengaturan level reorder, atau aktif/nonaktif warna.
export async function PATCH(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const v = await queryOne('SELECT * FROM variants WHERE id = ?', [b.id]);
  if (!v) return Response.json({ error: 'Varian tidak ditemukan' }, { status: 404 });
  try {
    await tx(async (q) => {
      const delta = Number(b.delta) || 0;
      // Koreksi stok wajib alasan, dan stok tidak boleh minus.
      if (delta) await koreksiStok(q, { variantId: v.id, userId: session.uid, delta, note: b.note });
      if (b.level_green != null) {
        const lv = { level_green: Number(b.level_green) || 0, level_yellow: Number(b.level_yellow) || 0, level_red: Number(b.level_red) || 0 };
        await q('UPDATE variants SET level_green = ?, level_yellow = ?, level_red = ? WHERE id = ?', [lv.level_green, lv.level_yellow, lv.level_red, v.id]);
        await catatBeda(q, { userId: session.uid, objek: 'warna', objekId: v.id, lama: v, baru: lv });
      }
      // Nonaktifkan / aktifkan warna. Tidak dihapus agar riwayat nota dan stok tetap utuh.
      if (b.active != null && !!b.active !== !!v.active) {
        await q('UPDATE variants SET active = ? WHERE id = ?', [b.active ? 1 : 0, v.id]);
        await catat(q, { userId: session.uid, objek: 'warna', objekId: v.id, aksi: b.active ? 'aktif' : 'nonaktif', lama: { active: v.active }, baru: { active: b.active ? 1 : 0 } });
      }
    });
    return Response.json({ ok: true });
  } catch (e) {
    return galat(e);
  }
}

// Ganti nama warna. Nama tidak boleh kembar dengan warna lain di produk yang sama.
export async function PUT(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  try {
    await tx(async (q) => {
      const [v] = await q('SELECT * FROM variants WHERE id = ? FOR UPDATE', [b.id]);
      if (!v) throw new BadRequest('Varian tidak ditemukan');
      const color = String(b.color || '').trim();
      if (!color) throw new BadRequest('Nama warna wajib diisi');
      const [dup] = await q('SELECT id FROM variants WHERE product_id = ? AND color = ? AND id <> ?', [v.product_id, color, v.id]);
      if (dup) throw new BadRequest(`Warna "${color}" sudah ada di produk ini`);
      await q('UPDATE variants SET color = ? WHERE id = ?', [color, v.id]);
      await catatBeda(q, { userId: session.uid, objek: 'warna', objekId: v.id, lama: v, baru: { color } });
    });
    return Response.json({ ok: true });
  } catch (e) {
    return galat(e);
  }
}

// Tambah warna (semua staf boleh).
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const color = (b.color || '').trim();
  try {
    const id = await tx(async (q) => {
      const [dup] = await q('SELECT id FROM variants WHERE product_id = ? AND color = ?', [b.product_id, color]);
      if (dup) throw new BadRequest(`Warna "${color}" sudah ada di produk ini`);
      const stock = Math.max(0, Number(b.stock) || 0);
      const r = await q(
        'INSERT INTO variants (product_id, color, stock, level_green, level_yellow, level_red) VALUES (?, ?, ?, ?, ?, ?)',
        [b.product_id, color, stock, Number(b.level_green) || 0, Number(b.level_yellow) || 0, Number(b.level_red) || 0]
      );
      await catat(q, { userId: session.uid, objek: 'warna', objekId: r.insertId, aksi: 'tambah', baru: { product_id: b.product_id, color, stock } });
      return r.insertId;
    });
    return Response.json({ ok: true, id });
  } catch (e) {
    return galat(e);
  }
}
