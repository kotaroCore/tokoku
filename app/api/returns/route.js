import { tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';

class BadRequest extends Error {}

const METHODS = ['cash', 'ewallet', 'transfer'];

// Retur sebagian atau seluruh barang dari satu nota.
// Nilai retur memotong dulu hutang nota itu (yang belum lunas), sisanya dikembalikan sebagai uang.
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const lines = (b.items || []).filter((i) => Number(i.qty) > 0);
  if (!lines.length) return Response.json({ error: 'Pilih barang yang diretur' }, { status: 400 });
  const method = METHODS.includes(b.refund_method) ? b.refund_method : 'cash';
  const restock = b.restock !== false;

  try {
    const result = await tx(async (q) => {
      // Kunci nota supaya dua retur bersamaan tidak melebihi jumlah yang dibeli.
      const [sale] = await q('SELECT * FROM sales WHERE id = ? FOR UPDATE', [b.sale_id]);
      if (!sale) throw new BadRequest('Nota tidak ditemukan');
      if (sale.status !== 'lunas') throw new BadRequest(`Retur hanya untuk nota lunas (nota ini ${sale.status})`);

      let total = 0;
      const done = [];
      const seen = new Set();
      for (const l of lines) {
        if (seen.has(l.sale_item_id)) throw new BadRequest('Barang yang sama dikirim dua kali');
        seen.add(l.sale_item_id);
        const [it] = await q('SELECT * FROM sale_items WHERE id = ? AND sale_id = ?', [l.sale_item_id, sale.id]);
        if (!it) throw new BadRequest('Barang tidak ada di nota ini');
        const [prev] = await q(
          'SELECT COALESCE(SUM(qty),0) AS qty, COALESCE(SUM(amount),0) AS amount FROM sale_return_items WHERE sale_item_id = ?',
          [it.id]
        );
        const qty = Number(l.qty);
        const sisa = it.qty - prev.qty;
        if (qty > sisa + 1e-9) {
          throw new BadRequest(`Retur ${it.product_name} ${it.color} melebihi sisa yang bisa diretur (${sisa} ${it.unit_name})`);
        }
        // Retur penuh sisa barang: ambil sisa nilai persis agar tidak ada selisih pembulatan.
        const amount = qty >= sisa - 1e-9 ? it.subtotal - prev.amount : Math.round((it.subtotal * qty) / it.qty);
        total += amount;
        done.push({ it, qty, amount });
      }

      // Hutang nota yang belum dikurangi lewat retur sebelumnya.
      const [{ reduced }] = await q('SELECT COALESCE(SUM(hutang_reduced),0) AS reduced FROM sale_returns WHERE sale_id = ?', [sale.id]);
      let hutangReduced = 0;
      if (sale.customer_id) {
        const [c] = await q('SELECT * FROM customers WHERE id = ? FOR UPDATE', [sale.customer_id]);
        hutangReduced = Math.max(0, Math.min(total, sale.hutang - reduced - sale.hutang_terbayar, c.total_hutang));
        if (hutangReduced > 0) await q('UPDATE customers SET total_hutang = total_hutang - ? WHERE id = ?', [hutangReduced, c.id]);
      }
      const refund = total - hutangReduced;

      const r = await q(
        `INSERT INTO sale_returns (sale_id, user_id, shift_id, total, hutang_reduced, refund_amount, refund_method, restock, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sale.id, session.uid, session.shiftId ?? null, total, hutangReduced, refund, method, restock ? 1 : 0, (b.note || '').trim() || null]
      );
      for (const d of done) {
        await q('INSERT INTO sale_return_items (return_id, sale_item_id, qty, amount) VALUES (?, ?, ?, ?)', [r.insertId, d.it.id, d.qty, d.amount]);
        if (restock) {
          const back = d.qty * d.it.factor;
          await q('UPDATE variants SET stock = stock + ? WHERE id = ?', [back, d.it.variant_id]);
          await q('INSERT INTO stock_adjustments (variant_id, user_id, delta, note) VALUES (?, ?, ?, ?)', [
            d.it.variant_id, session.uid, back, `Retur nota #${sale.id}`,
          ]);
        }
      }
      return { id: r.insertId, total, hutangReduced, refund, method };
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}
