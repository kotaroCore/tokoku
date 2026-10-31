import { query, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { tambahProduk, ubahProduk, aktifProduk } from '@/lib/produk';
import { galat } from '@/lib/galat';
import { tempatWarna } from '@/lib/lokasi';

export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const all = new URL(req.url).searchParams.get('all') === '1';
  const products = await query(`SELECT * FROM products ${all ? '' : 'WHERE active = 1'} ORDER BY category, name`);
  // Harga beli di nota pembelian terakhir tiap produk (hanya sebagai saran; modal produk tetap diatur manual).
  const lastBuy = await query(
    `SELECT i.product_id, i.unit_name, i.unit_cost, i.factor, DATE(pu.created_at) AS date
     FROM purchase_items i JOIN purchases pu ON pu.id = i.purchase_id
     WHERE i.id IN (SELECT MAX(id) FROM purchase_items WHERE product_id IS NOT NULL GROUP BY product_id)`
  );
  const units = await query('SELECT * FROM units ORDER BY factor');
  const variants = await query('SELECT * FROM variants ORDER BY color');
  const tempat = await tempatWarna(query, variants.map((v) => v.id));
  for (const v of variants) v.tempat = tempat[v.id] || [];
  return Response.json(
    products.map((p) => ({
      ...p,
      last_buy: lastBuy.find((x) => x.product_id === p.id) || null,
      units: units.filter((u) => u.product_id === p.id),
      variants: variants.filter((v) => v.product_id === p.id),
    }))
  );
}

// Tambah produk baru (semua staf boleh, termasuk harga awalnya).
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  try {
    const id = await tx((q) => tambahProduk(q, session, b));
    return Response.json({ ok: true, id });
  } catch (e) {
    return galat(e);
  }
}

// Ubah produk. Perubahan harga jual / satuan / modal ditolak (403) bila staf tidak punya izin.
export async function PUT(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  try {
    await tx((q) => ubahProduk(q, session, b));
    return Response.json({ ok: true });
  } catch (e) {
    return galat(e);
  }
}

// Aktifkan / nonaktifkan produk (tidak dihapus agar riwayat nota tetap utuh).
export async function PATCH(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  try {
    await tx((q) => aktifProduk(q, session, b.id, b.active));
    return Response.json({ ok: true });
  } catch (e) {
    return galat(e);
  }
}
