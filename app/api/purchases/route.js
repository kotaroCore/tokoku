import { query, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { BadRequest } from '@/lib/sales';
import { catatPembelian } from '@/lib/purchases';
import { boleh } from '@/lib/izin';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// Daftar pembelian per tanggal (atau ?pending=1: semua yang barangnya belum selesai masuk rak), lengkap dengan barangnya.
export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const sp = new URL(req.url).searchParams;
  const pending = sp.get('pending') === '1';
  const date = sp.get('date') || today();
  const rows = await query(
    `SELECT p.*, s.name AS supplier_name, u.name AS kasir
     FROM purchases p JOIN users u ON u.id = p.user_id LEFT JOIN suppliers s ON s.id = p.supplier_id
     WHERE ${pending
       ? 'p.status = \x27diterima\x27 AND EXISTS (SELECT 1 FROM purchase_items i WHERE i.purchase_id = p.id AND i.shelved < i.qty * i.factor - 0.000001)'
       : 'DATE(p.created_at) = ?'}
     ORDER BY p.id DESC`,
    pending ? [] : [date]
  );
  const items = rows.length
    ? await query('SELECT * FROM purchase_items WHERE purchase_id IN (?) ORDER BY id', [rows.map((r) => r.id)])
    : [];
  // Barang masuk dari PO: warna dan jumlah yang dipesan, untuk mengisi Masuk rak.
  const poIds = [...new Set(rows.map((r) => r.po_id).filter(Boolean))];
  const poItems = poIds.length ? await query('SELECT po_id, product_id, variant_id, qty * factor AS dasar FROM purchase_order_items WHERE po_id IN (?) AND variant_id IS NOT NULL', [poIds]) : [];
  return Response.json(rows.map((r) => ({ ...r, items: items.filter((i) => i.purchase_id === r.id), po_items: poItems.filter((i) => i.po_id === r.po_id) })));
}

// Catat nota dari supplier (per produk, tanpa warna). Pembelian dianggap langsung lunas (lib/purchases.js).
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  try {
    const result = await tx((q) => catatPembelian(q, { userId: session.uid, shiftId: session.shiftId, isAdmin: session.role === 'admin', bolehModal: boleh(session, 'ubah_modal') }, b));
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}
