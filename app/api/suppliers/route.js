import { query, queryOne } from '@/lib/db';
import { requireApi } from '@/lib/auth';

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
  const { error } = await requireApi();
  if (error) return error;
  const { error: err, data } = parse(await req.json());
  if (err) return bad(err);
  if (await queryOne('SELECT id FROM suppliers WHERE name = ?', [data.name])) return bad(`Supplier "${data.name}" sudah ada`);
  const r = await query('INSERT INTO suppliers (name, phone, address, note) VALUES (?, ?, ?, ?)', [data.name, data.phone, data.address, data.note]);
  return Response.json({ ok: true, id: r.insertId });
}

export async function PUT(req) {
  const { error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const { error: err, data } = parse(b);
  if (err) return bad(err);
  if (await queryOne('SELECT id FROM suppliers WHERE name = ? AND id <> ?', [data.name, b.id])) return bad(`Supplier "${data.name}" sudah ada`);
  const r = await query('UPDATE suppliers SET name = ?, phone = ?, address = ?, note = ? WHERE id = ?', [data.name, data.phone, data.address, data.note, b.id]);
  if (!r.affectedRows) return Response.json({ error: 'Supplier tidak ditemukan' }, { status: 404 });
  return Response.json({ ok: true });
}

export async function PATCH(req) {
  const { error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const r = await query('UPDATE suppliers SET active = ? WHERE id = ?', [b.active ? 1 : 0, b.id]);
  if (!r.affectedRows) return Response.json({ error: 'Supplier tidak ditemukan' }, { status: 404 });
  return Response.json({ ok: true });
}
