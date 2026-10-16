import { queryOne, query, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';

const MAX_HUTANG_BARU = 200000;

class BadRequest extends Error {}

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
    const result = await tx(async (q) => {
      let total = 0;
      const lines = [];
      for (const it of items) {
        // FOR UPDATE: kunci baris stok supaya dua kasir tidak menjual stok yang sama.
        const [v] = await q('SELECT * FROM variants WHERE id = ? FOR UPDATE', [it.variant_id]);
        const [p] = v ? await q('SELECT * FROM products WHERE id = ?', [v.product_id]) : [];
        const [u] = p ? await q('SELECT * FROM units WHERE id = ? AND product_id = ?', [it.unit_id, p.id]) : [];
        const qty = Number(it.qty);
        if (!v || !u || !(qty > 0)) throw new BadRequest('Item tidak valid');
        if (!v.active) throw new BadRequest(`Warna ${p.name} ${v.color} sudah dinonaktifkan`);
        const sudahDiKeranjang = lines.filter((l) => l.v.id === v.id).reduce((s, l) => s + l.need, 0);
        const need = qty * u.factor;
        if (v.stock < sudahDiKeranjang + need - 1e-9) {
          throw new BadRequest(`Stok ${p.name} ${v.color} tidak cukup (sisa ${v.stock} ${p.base_unit})`);
        }
        const disc = Math.min(100, Math.max(0, Number(it.discount_pct) || 0));
        lines.push({ v, p, u, qty, disc, subtotal: 0, need });
      }
      // Satu penjualan yang dipecah ke beberapa warna dihitung sebagai satu kelompok: dibulatkan sekali,
      // selisih pembulatan ke baris terakhir, supaya 1 dosin tidak jadi Rp 23.001.
      const groups = new Map();
      for (const l of lines) {
        const key = `${l.p.id}:${l.u.id}:${l.disc}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(l);
      }
      for (const g of groups.values()) {
        const exact = g.reduce((s, l) => s + l.qty * l.u.price * (1 - l.disc / 100), 0);
        let rest = Math.round(exact);
        g.forEach((l, i) => {
          l.subtotal = i === g.length - 1 ? rest : Math.round(l.qty * l.u.price * (1 - l.disc / 100));
          rest -= l.subtotal;
        });
      }
      for (const l of lines) total += l.subtotal;

      // Uang yang masuk dipakai untuk membayar hutang lama dulu, sisanya untuk belanja ini.
      const paid = paidCash + paidEwallet + paidTransfer;
      const forThisSale = Math.max(0, paid - payDebt);
      const hutangBaru = Math.max(0, total - forThisSale);

      let [customer] = customerName ? await q('SELECT * FROM customers WHERE name = ? FOR UPDATE', [customerName]) : [];
      if (hutangBaru > 0 || payDebt > 0) {
        if (!customerName) throw new BadRequest('Nama pembeli wajib diisi untuk hutang / bayar hutang');
        if (!customer) {
          const r = await q('INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)', [
            customerName, b.customer_phone || null, b.customer_address || null,
          ]);
          [customer] = await q('SELECT * FROM customers WHERE id = ?', [r.insertId]);
        }
      }
      if (payDebt > 0 && payDebt > customer.total_hutang + 1e-9) {
        throw new BadRequest('Pembayaran hutang lama melebihi sisa hutang');
      }
      if (hutangBaru > 0) {
        const known = customer.address || b.customer_address;
        if (hutangBaru > MAX_HUTANG_BARU && !known) {
          throw new BadRequest('Hutang per nota maksimal Rp 200.000 untuk pembeli tanpa alamat tercatat. Isi alamat pembeli.');
        }
      }

      const sale = await q(
        `INSERT INTO sales (user_id, shift_id, customer_id, channel, total, paid_cash, paid_ewallet, paid_transfer, hutang)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.uid, session.shiftId, customer?.id ?? null,
          b.channel === 'wholesale' ? 'wholesale' : 'retail',
          total, paidCash, paidEwallet, paidTransfer, hutangBaru,
        ]
      );

      for (const l of lines) {
        await q(
          `INSERT INTO sale_items (sale_id, variant_id, product_name, color, unit_name, qty, factor, unit_price, discount_pct, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [sale.insertId, l.v.id, l.p.name, l.v.color, l.u.name, l.qty, l.u.factor, l.u.price, l.disc, l.subtotal]
        );
        await q('UPDATE variants SET stock = stock - ? WHERE id = ?', [l.need, l.v.id]);
      }

      let sisaHutang = 0;
      if (payDebt > 0) {
        await q('INSERT INTO debt_payments (customer_id, user_id, amount) VALUES (?, ?, ?)', [customer.id, session.uid, payDebt]);
      }
      if (customer && (hutangBaru > 0 || payDebt > 0)) {
        await q(
          `UPDATE customers SET total_hutang = total_hutang + ? - ?,
             last_hutang_date = CASE WHEN ? > 0 THEN CURDATE() ELSE last_hutang_date END,
             phone = COALESCE(?, phone), address = COALESCE(?, address) WHERE id = ?`,
          [hutangBaru, payDebt, hutangBaru, b.customer_phone || null, b.customer_address || null, customer.id]
        );
        [{ total_hutang: sisaHutang }] = await q('SELECT total_hutang FROM customers WHERE id = ?', [customer.id]);
      }
      return { saleId: sale.insertId, total, hutangBaru, sisaHutang };
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}

export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const params = new URL(req.url).searchParams;
  const id = params.get('id');

  // Tanpa id: daftar nota per tanggal (untuk halaman Riwayat).
  if (!id) {
    const date = params.get('date') || new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const rows = await query(
      `SELECT s.id, s.created_at, s.total, s.hutang, s.channel, u.name AS kasir, c.name AS customer_name,
         (SELECT COALESCE(SUM(r.total),0) FROM sale_returns r WHERE r.sale_id = s.id) AS retur
       FROM sales s JOIN users u ON u.id = s.user_id LEFT JOIN customers c ON c.id = s.customer_id
       WHERE DATE(s.created_at) = ? ORDER BY s.id DESC`,
      [date]
    );
    return Response.json(rows);
  }

  const sale = await queryOne(
    `SELECT s.*, u.name AS kasir, c.name AS customer_name, c.total_hutang AS customer_hutang, c.last_hutang_date
     FROM sales s JOIN users u ON u.id = s.user_id LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`,
    [id]
  );
  if (!sale) return Response.json({ error: 'Nota tidak ditemukan' }, { status: 404 });
  const items = await query(
    `SELECT i.*, COALESCE((SELECT SUM(qty) FROM sale_return_items WHERE sale_item_id = i.id),0) AS returned_qty
     FROM sale_items i WHERE i.sale_id = ?`,
    [id]
  );
  const returns = await query(
    'SELECT r.*, u.name AS kasir FROM sale_returns r JOIN users u ON u.id = r.user_id WHERE r.sale_id = ? ORDER BY r.id',
    [id]
  );
  return Response.json({ ...sale, items, returns });
}
