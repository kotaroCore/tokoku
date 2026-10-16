import { query, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';

class BadRequest extends Error {}

const METHODS = ['cash', 'ewallet', 'transfer'];
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
       ? 'EXISTS (SELECT 1 FROM purchase_items i WHERE i.purchase_id = p.id AND i.shelved < i.qty * i.factor - 0.000001)'
       : 'DATE(p.created_at) = ?'}
     ORDER BY p.id DESC`,
    pending ? [] : [date]
  );
  const items = rows.length
    ? await query('SELECT * FROM purchase_items WHERE purchase_id IN (?) ORDER BY id', [rows.map((r) => r.id)])
    : [];
  return Response.json(rows.map((r) => ({ ...r, items: items.filter((i) => i.purchase_id === r.id) })));
}

// Catat nota dari supplier (per produk, tanpa warna). Pembelian dianggap langsung lunas.
// Stok baru bertambah saat barang dimasukkan rak per warna (/api/purchases/[id]/shelve).
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
        const [p] = await q('SELECT * FROM products WHERE id = ?', [l.product_id]);
        // Satuan kulakan bebas (gross, dosin, ...): nama + faktor (isi dalam satuan dasar) dikirim dari layar.
        const u = { name: String(l.unit_name || '').trim(), factor: Number(l.factor) };
        const qty = Number(l.qty);
        const cost = Number(l.unit_cost);
        if (!p || !u.name || u.name.length > 50 || !(u.factor > 0) || !(qty > 0) || !(cost >= 0)) throw new BadRequest('Barang, jumlah, atau harga beli tidak valid');
        if (!p.active) throw new BadRequest(`Produk ${p.name} sudah dinonaktifkan`);
        const subtotal = Math.round(qty * cost);
        total += subtotal;
        done.push({ p, u, qty, cost, subtotal });
      }

      const r = await q(
        'INSERT INTO purchases (supplier_id, user_id, shift_id, total, pay_method, note) VALUES (?, ?, ?, ?, ?, ?)',
        [supplierId, session.uid, session.shiftId ?? null, total, method, String(b.note || '').trim() || null]
      );
      for (const d of done) {
        await q(
          `INSERT INTO purchase_items (purchase_id, product_id, variant_id, product_name, color, unit_name, qty, factor, unit_cost, subtotal)
           VALUES (?, ?, NULL, ?, '', ?, ?, ?, ?, ?)`,
          [r.insertId, d.p.id, d.p.name, d.u.name, d.qty, d.u.factor, d.cost, d.subtotal]
        );
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
