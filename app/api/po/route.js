import { query, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { buatPO, ubahStatusPO } from '@/lib/po';
import { galat } from '@/lib/galat';

// Daftar PO. ?terbuka=1: hanya yang dikirim / diterima sebagian (untuk dipilih di barang masuk).
export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const terbuka = new URL(req.url).searchParams.get('terbuka') === '1';
  const rows = await query(
    `SELECT po.*, s.name AS supplier_name, u.name AS oleh FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id JOIN users u ON u.id = po.user_id
     ${terbuka ? "WHERE po.status IN ('dikirim', 'diterima_sebagian')" : ''} ORDER BY po.id DESC LIMIT 100`
  );
  const items = rows.length
    ? await query(
      `SELECT i.*, p.name AS product_name, p.base_unit, v.color FROM purchase_order_items i JOIN products p ON p.id = i.product_id
       LEFT JOIN variants v ON v.id = i.variant_id WHERE i.po_id IN (?) ORDER BY i.id`,
      [rows.map((r) => r.id)]
    )
    : [];
  return Response.json(rows.map((r) => ({ ...r, items: items.filter((i) => i.po_id === r.id) })));
}

// Buat PO (status draft): { supplier_id, items: [{ product_id, unit_name, factor, qty, harga_perkiraan? }], catatan }.
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  try {
    const r = await tx((q) => buatPO(q, session, b));
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return galat(e);
  }
}

// Kirim atau batalkan PO: { id, status: 'dikirim' | 'batal' }.
export async function PATCH(req) {
  const { error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  try {
    await tx((q) => ubahStatusPO(q, Number(b.id), b.status));
    return Response.json({ ok: true });
  } catch (e) {
    return galat(e);
  }
}
