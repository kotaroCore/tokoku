import { query, queryOne, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { catat, catatBeda } from '@/lib/catatan';

const bad = (error) => Response.json({ error }, { status: 400 });

function parse(b) {
  const name = String(b.name || '').trim();
  if (!name) return { error: 'Nama supplier wajib diisi' };
  const clean = (x) => String(x || '').trim() || null;
  return { data: { name, phone: clean(b.phone), address: clean(b.address), note: clean(b.note) } };
}

// ?all=1 menyertakan supplier nonaktif. Supplier tidak dihapus, hanya dinonaktifkan.
export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const all = new URL(req.url).searchParams.get('all') === '1';
  return Response.json(await query(`SELECT * FROM suppliers ${all ? '' : 'WHERE active = 1'} ORDER BY active DESC, name`));
}

export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const { error: err, data } = parse(await req.json());
  if (err) return bad(err);
  if (await queryOne('SELECT id FROM suppliers WHERE name = ?', [data.name])) return bad(`Supplier "${data.name}" sudah ada`);
  const id = await tx(async (q) => {
    const r = await q('INSERT INTO suppliers (name, phone, address, note) VALUES (?, ?, ?, ?)', [data.name, data.phone, data.address, data.note]);
    await catat(q, { userId: session.uid, objek: 'supplier', objekId: r.insertId, aksi: 'tambah', baru: data });
    return r.insertId;
  });
  return Response.json({ ok: true, id });
}

export async function PUT(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const { error: err, data } = parse(b);
  if (err) return bad(err);
  if (await queryOne('SELECT id FROM suppliers WHERE name = ? AND id <> ?', [data.name, b.id])) return bad(`Supplier "${data.name}" sudah ada`);
  const ada = await tx(async (q) => {
    const [cur] = await q('SELECT * FROM suppliers WHERE id = ? FOR UPDATE', [b.id]);
    if (!cur) return false;
    await q('UPDATE suppliers SET name = ?, phone = ?, address = ?, note = ? WHERE id = ?', [data.name, data.phone, data.address, data.note, cur.id]);
    await catatBeda(q, { userId: session.uid, objek: 'supplier', objekId: cur.id, lama: cur, baru: data });
    return true;
  });
  if (!ada) return Response.json({ error: 'Supplier tidak ditemukan' }, { status: 404 });
  return Response.json({ ok: true });
}

export async function PATCH(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const ada = await tx(async (q) => {
    const [cur] = await q('SELECT * FROM suppliers WHERE id = ? FOR UPDATE', [b.id]);
    if (!cur) return false;
    const active = b.active ? 1 : 0;
    await q('UPDATE suppliers SET active = ? WHERE id = ?', [active, cur.id]);
    await catatBeda(q, { userId: session.uid, objek: 'supplier', objekId: cur.id, aksi: active ? 'aktif' : 'nonaktif', lama: cur, baru: { active } });
    return true;
  });
  if (!ada) return Response.json({ error: 'Supplier tidak ditemukan' }, { status: 404 });
  return Response.json({ ok: true });
}
