import { query, queryOne } from '@/lib/db';
import { requireApi } from '@/lib/auth';

const bad = (error) => Response.json({ error }, { status: 400 });

function parse(b) {
  const name = String(b.name || '').trim();
  if (!name) return { error: 'Nama satuan wajib diisi' };
  if (name.length > 30) return { error: 'Nama satuan maksimal 30 karakter' };
  // Faktor boleh kosong (mis. "paket" yang isinya beda-beda tiap produk).
  const raw = String(b.factor ?? '').trim();
  const factor = raw === '' ? null : Number(raw);
  if (factor !== null && !(factor > 0)) return { error: 'Faktor harus lebih dari 0 atau dikosongkan' };
  return { data: { name, factor } };
}

// Daftar pilihan satuan jual di form produk. Kosong sampai ditambah lewat halaman Satuan.
export async function GET() {
  const { error } = await requireApi();
  if (error) return error;
  return Response.json(await query('SELECT id, name, factor FROM unit_presets ORDER BY factor IS NULL, factor, name'));
}

export async function POST(req) {
  const { error } = await requireApi();
  if (error) return error;
  const { error: err, data } = parse(await req.json());
  if (err) return bad(err);
  if (await queryOne('SELECT id FROM unit_presets WHERE name = ?', [data.name])) return bad(`Satuan "${data.name}" sudah ada`);
  const r = await query('INSERT INTO unit_presets (name, factor) VALUES (?, ?)', [data.name, data.factor]);
  return Response.json({ ok: true, id: r.insertId });
}

export async function PUT(req) {
  const { error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const { error: err, data } = parse(b);
  if (err) return bad(err);
  if (await queryOne('SELECT id FROM unit_presets WHERE name = ? AND id <> ?', [data.name, b.id])) return bad(`Satuan "${data.name}" sudah ada`);
  const r = await query('UPDATE unit_presets SET name = ?, factor = ? WHERE id = ?', [data.name, data.factor, b.id]);
  if (!r.affectedRows) return Response.json({ error: 'Satuan tidak ditemukan' }, { status: 404 });
  return Response.json({ ok: true });
}

// Aman dihapus: produk menyimpan salinan nama dan faktor satuannya sendiri.
export async function DELETE(req) {
  const { error } = await requireApi();
  if (error) return error;
  const { id } = await req.json();
  await query('DELETE FROM unit_presets WHERE id = ?', [id]);
  return Response.json({ ok: true });
}
