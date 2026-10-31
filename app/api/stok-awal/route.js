import { query, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { isiStokAwal } from '@/lib/stok';
import { galat } from '@/lib/galat';

// Kemajuan per kategori, dan (?kategori=X) semua produk aktif beserta warna dan satuan jualnya.
export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const kategori = new URL(req.url).searchParams.get('kategori');
  const kemajuan = await query(
    `SELECT p.category, COUNT(*) AS warna, SUM(v.stok_awal_pada IS NOT NULL) AS dihitung
     FROM variants v JOIN products p ON p.id = v.product_id WHERE p.active = 1 AND v.active = 1
     GROUP BY p.category ORDER BY p.category`
  );
  if (!kategori) return Response.json({ kemajuan, produk: [] });
  const produk = await query('SELECT id, name, base_unit FROM products WHERE active = 1 AND category = ? ORDER BY name', [kategori]);
  const ids = produk.map((p) => p.id);
  const variants = ids.length ? await query('SELECT id, product_id, color, stock, stok_awal_pada FROM variants WHERE active = 1 AND product_id IN (?) ORDER BY color', [ids]) : [];
  const units = ids.length ? await query('SELECT id, product_id, name, factor FROM units WHERE product_id IN (?) ORDER BY factor', [ids]) : [];
  return Response.json({
    kemajuan,
    produk: produk.map((p) => ({ ...p, variants: variants.filter((v) => v.product_id === p.id), units: units.filter((u) => u.product_id === p.id) })),
  });
}

// Simpan satu baris: { variant_id, qty, factor } (qty dalam satuan yang dipilih, factor = isinya dalam satuan dasar).
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  try {
    const jumlah = Number(b.qty) * (Number(b.factor) || 1);
    const r = await tx((q) => isiStokAwal(q, { variantId: Number(b.variant_id), userId: session.uid, jumlah }));
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return galat(e);
  }
}
