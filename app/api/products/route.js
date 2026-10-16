import { query, queryOne, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';

const bad = (error) => Response.json({ error }, { status: 400 });

// Validasi & rapikan isi form produk. Mengembalikan { error } atau { data }.
function parse(b) {
  const category = String(b.category || '').trim().toUpperCase();
  const name = String(b.name || '').trim();
  if (!name || !category) return { error: 'Kategori dan nama wajib diisi' };
  const base_unit = String(b.base_unit || '').trim() || 'biji';
  const cost = Number(b.cost) || 0;
  if (cost < 0) return { error: 'Harga beli tidak boleh negatif' };

  const units = (b.units || [])
    .filter((u) => u.name?.trim() || String(u.price ?? '') !== '')
    .map((u) => ({
      id: u.id ? Number(u.id) : null,
      name: String(u.name || '').trim(),
      factor: Number(u.factor),
      price: Number(u.price),
    }));
  if (!units.length) return { error: 'Minimal satu satuan jual' };
  for (const u of units) {
    if (!u.name) return { error: 'Nama satuan wajib diisi' };
    if (!(u.factor > 0)) return { error: `Faktor satuan "${u.name}" harus lebih dari 0` };
    if (!(u.price >= 0)) return { error: `Harga satuan "${u.name}" tidak valid` };
  }
  const names = units.map((u) => u.name.toLowerCase());
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) return { error: `Satuan "${dup}" muncul lebih dari sekali. Beri judul paket yang berbeda (mis. "setengah lusin") agar bisa dibedakan.` };

  return { data: { category, name, base_unit, cost, units } };
}

const num0 = (x) => Math.max(0, Number(x) || 0);

export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const all = new URL(req.url).searchParams.get('all') === '1';
  const products = await query(`SELECT * FROM products ${all ? '' : 'WHERE active = 1'} ORDER BY category, name`);
  const units = await query('SELECT * FROM units ORDER BY factor');
  const variants = await query('SELECT * FROM variants ORDER BY color');
  return Response.json(
    products.map((p) => ({
      ...p,
      units: units.filter((u) => u.product_id === p.id),
      variants: variants.filter((v) => v.product_id === p.id),
    }))
  );
}

export async function POST(req) {
  const { error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const { error: err, data } = parse(b);
  if (err) return bad(err);

  const dup = await queryOne('SELECT id FROM products WHERE category = ? AND name = ?', [data.category, data.name]);
  if (dup) return bad(`Produk "${data.name}" di kategori ${data.category} sudah ada`);

  const variants = b.variants?.length ? b.variants : [{ color: '' }];
  const colors = variants.map((v) => String(v.color || '').trim().toLowerCase());
  if (new Set(colors).size !== colors.length) return bad('Nama warna tidak boleh kembar');

  const id = await tx(async (q) => {
    const p = await q('INSERT INTO products (category, name, base_unit, cost) VALUES (?, ?, ?, ?)', [
      data.category, data.name, data.base_unit, data.cost,
    ]);
    for (const u of data.units) {
      await q('INSERT INTO units (product_id, name, factor, price) VALUES (?, ?, ?, ?)', [p.insertId, u.name, u.factor, u.price]);
    }
    for (const v of variants) {
      await q(
        'INSERT INTO variants (product_id, color, stock, level_green, level_yellow, level_red) VALUES (?, ?, ?, ?, ?, ?)',
        [p.insertId, String(v.color || '').trim(), Number(v.stock) || 0, num0(v.level_green), num0(v.level_yellow), num0(v.level_red)]
      );
    }
    return p.insertId;
  });
  return Response.json({ ok: true, id });
}

// Ubah data produk + satuan jual. Satuan dicocokkan lewat id: ada id = diubah,
// tanpa id = ditambah, tidak dikirim = dihapus. Nota lama aman karena menyimpan salinan nama/harga.
export async function PUT(req) {
  const { error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const cur = await queryOne('SELECT * FROM products WHERE id = ?', [b.id]);
  if (!cur) return Response.json({ error: 'Produk tidak ditemukan' }, { status: 404 });
  const { error: err, data } = parse(b);
  if (err) return bad(err);

  const dup = await queryOne('SELECT id FROM products WHERE category = ? AND name = ? AND id <> ?', [data.category, data.name, cur.id]);
  if (dup) return bad(`Produk "${data.name}" di kategori ${data.category} sudah ada`);

  await tx(async (q) => {
    await q('UPDATE products SET category = ?, name = ?, base_unit = ?, cost = ? WHERE id = ?', [
      data.category, data.name, data.base_unit, data.cost, cur.id,
    ]);
    const old = await q('SELECT id FROM units WHERE product_id = ?', [cur.id]);
    const keep = new Set(data.units.filter((u) => u.id).map((u) => u.id));
    for (const o of old) {
      if (!keep.has(o.id)) await q('DELETE FROM units WHERE id = ?', [o.id]);
    }
    for (const u of data.units) {
      if (u.id && old.some((o) => o.id === u.id)) {
        await q('UPDATE units SET name = ?, factor = ?, price = ? WHERE id = ? AND product_id = ?', [u.name, u.factor, u.price, u.id, cur.id]);
      } else {
        await q('INSERT INTO units (product_id, name, factor, price) VALUES (?, ?, ?, ?)', [cur.id, u.name, u.factor, u.price]);
      }
    }
  });
  return Response.json({ ok: true });
}

// Aktifkan / nonaktifkan produk (tidak dihapus agar riwayat nota tetap utuh).
export async function PATCH(req) {
  const { error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const r = await query('UPDATE products SET active = ? WHERE id = ?', [b.active ? 1 : 0, b.id]);
  if (!r.affectedRows) return Response.json({ error: 'Produk tidak ditemukan' }, { status: 404 });
  return Response.json({ ok: true });
}
