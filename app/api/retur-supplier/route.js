import { query, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { buatReturSupplier, selesaikanReturSupplier } from '@/lib/rusak';
import { galat } from '@/lib/galat';

// Daftar retur ke supplier. ?semua=1 menyertakan yang sudah selesai (100 terbaru).
export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const semua = new URL(req.url).searchParams.get('semua') === '1';
  const rows = await query(
    `SELECT r.*, s.name AS supplier_name, u.name AS oleh FROM retur_supplier r
     JOIN suppliers s ON s.id = r.supplier_id JOIN users u ON u.id = r.user_id
     ${semua ? '' : "WHERE r.status = 'dikirim'"} ORDER BY r.id DESC LIMIT 100`
  );
  const items = rows.length
    ? await query(
      `SELECT i.*, v.color, p.name AS product_name, p.base_unit FROM retur_supplier_item i
       JOIN variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id WHERE i.retur_supplier_id IN (?)`,
      [rows.map((r) => r.id)]
    )
    : [];
  return Response.json(rows.map((r) => ({ ...r, items: items.filter((i) => i.retur_supplier_id === r.id) })));
}

// Kirim barang rusak ke supplier. Body: { supplier_id, items: [{ variant_id, qty }], catatan }.
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  try {
    const r = await tx((q) => buatReturSupplier(q, session, b));
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return galat(e);
  }
}

// Selesaikan retur: { id, status: 'diganti' | 'diuangkan' | 'ditolak', uang?, catatan? }.
export async function PATCH(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  try {
    const r = await tx((q) => selesaikanReturSupplier(q, session, Number(b.id), b));
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return galat(e);
  }
}
