import { db } from '@/lib/db';
import { requireApi } from '@/lib/auth';

const MAX_HUTANG_BARU = 200000;

export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const items = b.items || [];
  if (!items.length) return Response.json({ error: 'Keranjang kosong' }, { status: 400 });

  const paidCash = Number(b.paid_cash) || 0;
  const paidEwallet = Number(b.paid_ewallet) || 0;
  const paidTransfer = Number(b.paid_transfer) || 0;
  const payDebt = Number(b.pay_old_debt) || 0;
  const customerName = (b.customer_name || '').trim();

  try {
    const result = db.transaction(() => {
      let total = 0;
      const lines = [];
      for (const it of items) {
        const v = db.prepare('SELECT * FROM variants WHERE id = ?').get(it.variant_id);
        const p = v && db.prepare('SELECT * FROM products WHERE id = ?').get(v.product_id);
        const u = p && db.prepare('SELECT * FROM units WHERE id = ? AND product_id = ?').get(it.unit_id, p.id);
        const qty = Number(it.qty);
        if (!v || !u || !(qty > 0)) throw new Error('Item tidak valid');
        const need = qty * u.factor;
        if (v.stock < need - 1e-9) {
          throw new Error(`Stok ${p.name} ${v.color} tidak cukup (sisa ${v.stock} ${p.base_unit})`);
        }
        const disc = Math.min(100, Math.max(0, Number(it.discount_pct) || 0));
        const subtotal = Math.round(qty * u.price * (1 - disc / 100));
        total += subtotal;
        lines.push({ v, p, u, qty, disc, subtotal, need });
      }

      // Uang yang masuk dipakai untuk membayar hutang lama dulu, sisanya untuk belanja ini.
      const paid = paidCash + paidEwallet + paidTransfer;
      const forThisSale = Math.max(0, paid - payDebt);
      const hutangBaru = Math.max(0, total - forThisSale);

      let customer = customerName
        ? db.prepare('SELECT * FROM customers WHERE name = ?').get(customerName)
        : null;
      if (hutangBaru > 0 || payDebt > 0) {
        if (!customerName) throw new Error('Nama pembeli wajib diisi untuk hutang / bayar hutang');
        if (!customer) {
          const r = db
            .prepare('INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)')
            .run(customerName, b.customer_phone || null, b.customer_address || null);
          customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(r.lastInsertRowid);
        }
      }
      if (payDebt > 0 && payDebt > customer.total_hutang + 1e-9) {
        throw new Error('Pembayaran hutang lama melebihi sisa hutang');
      }
      if (hutangBaru > 0) {
        const known = customer.address || b.customer_address;
        if (hutangBaru > MAX_HUTANG_BARU && !known) {
          throw new Error('Hutang per nota maksimal Rp 200.000 untuk pembeli tanpa alamat tercatat. Isi alamat pembeli.');
        }
      }

      const sale = db
        .prepare(
          `INSERT INTO sales (user_id, shift_id, customer_id, channel, total, paid_cash, paid_ewallet, paid_transfer, hutang)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          session.uid, session.shiftId, customer?.id ?? null,
          b.channel === 'wholesale' ? 'wholesale' : 'retail',
          total, paidCash, paidEwallet, paidTransfer, hutangBaru
        );
      const saleId = Number(sale.lastInsertRowid);

      for (const l of lines) {
        db.prepare(
          `INSERT INTO sale_items (sale_id, variant_id, product_name, color, unit_name, qty, factor, unit_price, discount_pct, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(saleId, l.v.id, l.p.name, l.v.color, l.u.name, l.qty, l.u.factor, l.u.price, l.disc, l.subtotal);
        db.prepare('UPDATE variants SET stock = stock - ? WHERE id = ?').run(l.need, l.v.id);
      }

      let sisaHutang = 0;
      if (payDebt > 0) {
        db.prepare('INSERT INTO debt_payments (customer_id, user_id, amount) VALUES (?, ?, ?)').run(customer.id, session.uid, payDebt);
      }
      if (customer && (hutangBaru > 0 || payDebt > 0)) {
        db.prepare(
          `UPDATE customers SET total_hutang = total_hutang + ? - ?,
             last_hutang_date = CASE WHEN ? > 0 THEN date('now','localtime') ELSE last_hutang_date END,
             phone = COALESCE(?, phone), address = COALESCE(?, address) WHERE id = ?`
        ).run(hutangBaru, payDebt, hutangBaru, b.customer_phone || null, b.customer_address || null, customer.id);
        sisaHutang = db.prepare('SELECT total_hutang FROM customers WHERE id = ?').get(customer.id).total_hutang;
      }
      return { saleId, total, hutangBaru, sisaHutang };
    })();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const id = new URL(req.url).searchParams.get('id');
  const sale = db
    .prepare(
      `SELECT s.*, u.name AS kasir, c.name AS customer_name, c.total_hutang AS customer_hutang, c.last_hutang_date
       FROM sales s JOIN users u ON u.id = s.user_id LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`
    )
    .get(id);
  if (!sale) return Response.json({ error: 'Nota tidak ditemukan' }, { status: 404 });
  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(id);
  return Response.json({ ...sale, items });
}
