import { query, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { BadRequest } from '@/lib/sales';
import { catatBeda } from '@/lib/catatan';
import { galat } from '@/lib/galat';

const label = (l) => [l.ruangan, l.lemari, l.rak].filter(Boolean).join(' / ');

// Daftar lokasi seragam (?all=1 menyertakan yang nonaktif). Label = "ruangan / lemari / rak".
export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const all = new URL(req.url).searchParams.get('all') === '1';
  const rows = await query(`SELECT * FROM lokasi ${all ? '' : 'WHERE aktif = 1'} ORDER BY ruangan, lemari, rak`);
  return Response.json(rows.map((l) => ({ ...l, label: label(l) })));
}

// Tambah lokasi: { ruangan, lemari, rak }.
export async function POST(req) {
  const { error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const l = { ruangan: String(b.ruangan || '').trim(), lemari: String(b.lemari || '').trim(), rak: String(b.rak || '').trim() };
  if (!l.ruangan) return Response.json({ error: 'Ruangan wajib diisi' }, { status: 400 });
  if (label(l).length > 50) return Response.json({ error: 'Nama lokasi terlalu panjang (maks. 50 huruf)' }, { status: 400 });
  const ada = await query('SELECT id FROM lokasi WHERE ruangan = ? AND lemari = ? AND rak = ?', [l.ruangan, l.lemari, l.rak]);
  if (ada.length) return Response.json({ error: `Lokasi ${label(l)} sudah ada` }, { status: 400 });
  const r = await query('INSERT INTO lokasi (ruangan, lemari, rak) VALUES (?, ?, ?)', [l.ruangan, l.lemari, l.rak]);
  return Response.json({ ok: true, id: r.insertId });
}

// Aktif / nonaktifkan lokasi ({ id, aktif }), atau atur lokasi utama warna ({ variant_id, lokasi_rak }).
export async function PATCH(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  try {
    if (b.variant_id) {
      await tx(async (q) => {
        const [v] = await q('SELECT * FROM variants WHERE id = ? FOR UPDATE', [b.variant_id]);
        if (!v) throw new BadRequest('Warna tidak ditemukan');
        const lokasi_rak = String(b.lokasi_rak || '').trim().slice(0, 50) || null;
        await q('UPDATE variants SET lokasi_rak = ? WHERE id = ?', [lokasi_rak, v.id]);
        await catatBeda(q, { userId: session.uid, objek: 'warna', objekId: v.id, lama: v, baru: { lokasi_rak } });
      });
    } else {
      await query('UPDATE lokasi SET aktif = ? WHERE id = ?', [b.aktif ? 1 : 0, b.id]);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return galat(e);
  }
}
