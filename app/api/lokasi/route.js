import { query, tx } from '@/lib/db';
import { requireApi, requireRoleApi } from '@/lib/auth';
import { aturLokasi, gantiNamaLokasi, labelLokasi } from '@/lib/lokasi';
import { catat } from '@/lib/catatan';
import { galat } from '@/lib/galat';

// Daftar lokasi (?all=1 menyertakan yang nonaktif), dengan jumlah warna yang disimpan di sana.
export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const all = new URL(req.url).searchParams.get('all') === '1';
  const rows = await query(
    `SELECT l.*, (SELECT COUNT(*) FROM variant_lokasi vl WHERE vl.lokasi_id = l.id) AS warna
     FROM lokasi l ${all ? '' : 'WHERE l.aktif = 1'} ORDER BY l.ruangan, l.lemari, l.rak`
  );
  return Response.json(rows.map((l) => ({ ...l, label: labelLokasi(l) })));
}

// Tambah lokasi (hanya admin, supaya nama tempat seragam): { ruangan, lemari, rak }.
export async function POST(req) {
  const { session, error } = await requireRoleApi('admin');
  if (error) return error;
  const b = await req.json();
  const l = { ruangan: String(b.ruangan || '').trim(), lemari: String(b.lemari || '').trim(), rak: String(b.rak || '').trim() };
  if (!l.ruangan) return Response.json({ error: 'Ruangan wajib diisi' }, { status: 400 });
  if (labelLokasi(l).length > 50) return Response.json({ error: 'Nama lokasi terlalu panjang (maks. 50 huruf)' }, { status: 400 });
  const ada = await query('SELECT id FROM lokasi WHERE ruangan = ? AND lemari = ? AND rak = ?', [l.ruangan, l.lemari, l.rak]);
  if (ada.length) return Response.json({ error: `Lokasi ${labelLokasi(l)} sudah ada` }, { status: 400 });
  const id = await tx(async (q) => {
    const r = await q('INSERT INTO lokasi (ruangan, lemari, rak) VALUES (?, ?, ?)', [l.ruangan, l.lemari, l.rak]);
    await catat(q, { userId: session.uid, objek: 'pengaturan', objekId: r.insertId, aksi: 'tambah', baru: { lokasi: labelLokasi(l) } });
    return r.insertId;
  });
  return Response.json({ ok: true, id });
}

// - { variant_id, tempat: [{ lokasi_id, qty }] }: atur tempat penyimpanan warna (semua staf; maks. 3,
//   stok tempat 1 = stok warna dikurangi tempat lain).
// - { id, ruangan, lemari, rak }: ganti nama lokasi (admin); semua warna yang memakainya ikut.
// - { id, aktif }: aktif / nonaktifkan lokasi (admin). Lokasi tidak dihapus.
export async function PATCH(req) {
  const b = await req.json();
  if (b.variant_id) {
    const { session, error } = await requireApi();
    if (error) return error;
    try {
      await tx((q) => aturLokasi(q, { variantId: Number(b.variant_id), userId: session.uid, tempat: b.tempat }));
      return Response.json({ ok: true });
    } catch (e) {
      return galat(e);
    }
  }
  const { session, error } = await requireRoleApi('admin');
  if (error) return error;
  try {
    if (b.ruangan != null) {
      await tx((q) => gantiNamaLokasi(q, { id: Number(b.id), ruangan: b.ruangan, lemari: b.lemari, rak: b.rak, userId: session.uid }));
    } else {
      await tx(async (q) => {
        await q('UPDATE lokasi SET aktif = ? WHERE id = ?', [b.aktif ? 1 : 0, b.id]);
        await catat(q, { userId: session.uid, objek: 'pengaturan', objekId: Number(b.id), aksi: b.aktif ? 'aktif' : 'nonaktif', baru: { lokasi_aktif: b.aktif ? 1 : 0 } });
      });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return galat(e);
  }
}
