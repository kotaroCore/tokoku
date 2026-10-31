import { query, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { simpanOpname } from '@/lib/stok';
import { galat } from '@/lib/galat';

// ?variant_id=X: stok sistem, lokasi utama, dan lokasi dari opname terakhir warna itu (untuk mengisi baris).
// Tanpa parameter: 100 opname terakhir.
export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const vid = Number(new URL(req.url).searchParams.get('variant_id'));
  if (vid) {
    const [v] = await query(
      'SELECT v.id, v.color, v.stock, v.lokasi_rak, p.name AS product_name, p.base_unit FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?',
      [vid]
    );
    if (!v) return Response.json({ error: 'Warna tidak ditemukan' }, { status: 404 });
    const lokasi = await query(
      "SELECT DISTINCT i.lokasi FROM opname_item i WHERE i.opname_id = (SELECT MAX(id) FROM opname WHERE variant_id = ?) AND i.lokasi <> ''",
      [vid]
    );
    return Response.json({ ...v, lokasi_terakhir: lokasi.map((l) => l.lokasi) });
  }
  const rows = await query(
    `SELECT o.*, v.color, p.name AS product_name, p.base_unit, u.name AS oleh FROM opname o
     JOIN variants v ON v.id = o.variant_id JOIN products p ON p.id = v.product_id JOIN users u ON u.id = o.user_id
     ORDER BY o.id DESC LIMIT 100`
  );
  const items = rows.length ? await query('SELECT * FROM opname_item WHERE opname_id IN (?)', [rows.map((r) => r.id)]) : [];
  return Response.json(rows.map((r) => ({ ...r, items: items.filter((i) => i.opname_id === r.id) })));
}

// Simpan opname: { variant_id, items: [{ lokasi, qty }], alasan }.
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  try {
    const r = await tx((q) => simpanOpname(q, { variantId: Number(b.variant_id), userId: session.uid, items: b.items, alasan: b.alasan }));
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return galat(e);
  }
}
