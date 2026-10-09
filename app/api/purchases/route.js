import { query, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';

class BadRequest extends Error {}

const METHODS = ['cash', 'ewallet', 'transfer'];
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// Daftar pembelian per tanggal, lengkap dengan barangnya.
export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const date = new URL(req.url).searchParams.get('date') || today();
  const rows = await query(
    `SELECT p.*, s.name AS supplier_name, u.name AS kasir
     FROM purchases p JOIN users u ON u.id = p.user_id LEFT JOIN suppliers s ON s.id = p.supplier_id
     WHERE DATE(p.created_at) = ? ORDER BY p.id DESC`,
    [date]
  );
  const items = rows.length
    ? await query('SELECT * FROM purchase_items WHERE purchase_id IN (?) ORDER BY id', [rows.map((r) => r.id)])
    : [];
  return Response.json(rows.map((r) => ({ ...r, items: items.filter((i) => i.purchase_id === r.id) })));
}

// Catat barang masuk dari supplier. Pembelian dianggap langsung lunas; stok bertambah otomatis.
// Harga beli produk (modal) tidak diubah otomatis.
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const lines = b.items || [];
  if (!lines.length) return Response.json({ error: 'Belum ada barang' }, { status: 400 });
  const method = METHODS.includes(b.pay_method) ? b.pay_method : 'cash';

  try {
    const result = await tx(async (q) => {
      let supplierId = null;
      if (b.supplier_id) {
        const [s] = await q('SELECT * FROM suppliers WHERE id = ?', [b.supplier_id]);
        if (!s || !s.active) throw new BadRequest('Supplier tidak ditemukan atau nonaktif');
        supplierId = s.id;
      }

      let total = 0;
      const done = [];
      for (const l of lines) {
        const [v] = await q('SELECT * FROM variants WHERE id = ? FOR UPDATE', [l.variant_id]);
        const [p] = v ? await q('SELECT * FROM products WHERE id = ?', [v.product_id]) : [];
        const [u] = p ? await q('SELECT * FROM units WHERE id = ? AND product_id = ?', [l.unit_id, p.id]) : [];
        const qty = Number(l.qty);
        const cost = Number(l.unit_cost);
        if (!v || !u || !(qty > 0) || !(cost >= 0)) throw new BadRequest('Barang, jumlah, atau harga beli tidak valid');
        const subtotal = Math.round(qty * cost);
        total += subtotal;
        done.push({ v, p, u, qty, cost, subtotal });
      }

      const r = await q(
        'INSERT INTO purchases (supplier_id, user_id, shift_id, total, pay_method, note) VALUES (?, ?, ?, ?, ?, ?)',
        [supplierId, session.uid, session.shiftId ?? null, total, method, String(b.note || '').trim() || null]
      );
      for (const d of done) {
        await q(
          `INSERT INTO purchase_items (purchase_id, variant_id, product_name, color, unit_name, qty, factor, unit_cost, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [r.insertId, d.v.id, d.p.name, d.v.color, d.u.name, d.qty, d.u.factor, d.cost, d.subtotal]
        );
        const add = d.qty * d.u.factor;
        await q('UPDATE variants SET stock = stock + ? WHERE id = ?', [add, d.v.id]);
        await q('INSERT INTO stock_adjustments (variant_id, user_id, delta, note) VALUES (?, ?, ?, ?)', [
          d.v.id, session.uid, add, `Pembelian #${r.insertId}`,
        ]);
      }
      return { id: r.insertId, total };
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}
