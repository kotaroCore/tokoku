// Logika nota penjualan: draf -> lunas / batal.
// - Draf tidak menyentuh stok. Stok berkurang saat nota dilunasi, dan ditolak bila tidak cukup.
// - Hutang dan pembayaran hutang lama baru tercatat di pelanggan saat nota lunas.
// - Nota batal dan nota lunas tidak dihapus.

export class BadRequest extends Error {}

const MAX_HUTANG_BARU = 200000;
const EPS = 1e-9;

// Nomor NT-YYYYMMDD-#### per hari. Baris hari ini dikunci sampai transaksi selesai,
// jadi dua kasir yang menyimpan bersamaan tidak mendapat nomor yang sama.
export async function nomorBaru(q) {
  await q('INSERT IGNORE INTO nomor_nota (tanggal, terakhir) VALUES (CURDATE(), 0)');
  const [{ terakhir, ymd }] = await q(
    "SELECT terakhir, DATE_FORMAT(tanggal, '%Y%m%d') AS ymd FROM nomor_nota WHERE tanggal = CURDATE() FOR UPDATE"
  );
  const n = terakhir + 1;
  await q('UPDATE nomor_nota SET terakhir = ? WHERE tanggal = CURDATE()', [n]);
  return `NT-${ymd}-${String(n).padStart(4, '0')}`;
}

// Membuat nota berstatus draf. Belum mengurangi stok.
// Stok dicek di sini hanya supaya kasir cepat tahu; pengecekan final ada di lunasiNota.
export async function buatNota(q, { userId, shiftId, items, channel, customerName, customerPhone, customerAddress, paidCash, paidEwallet, paidTransfer, payDebt }) {
  if (!items.length) throw new BadRequest('Keranjang kosong');
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
    if (v.stock < sudahDiKeranjang + need - EPS) {
      throw new BadRequest(`Stok ${p.name} ${v.color} tidak cukup (sisa ${v.stock} ${p.base_unit})`);
    }
    const disc = Math.min(100, Math.max(0, Number(it.discount_pct) || 0));
    lines.push({ v, p, u, qty, disc, subtotal: 0, need, auto: !!it.auto });
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
      const r = await q('INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)', [customerName, customerPhone || null, customerAddress || null]);
      [customer] = await q('SELECT * FROM customers WHERE id = ?', [r.insertId]);
    }
    // Data pembeli dilengkapi sekarang; hutang dan pembayaran hutang lama dicatat saat nota lunas.
    await q('UPDATE customers SET phone = COALESCE(?, phone), address = COALESCE(?, address) WHERE id = ?', [
      customerPhone || null, customerAddress || null, customer.id,
    ]);
    [customer] = await q('SELECT * FROM customers WHERE id = ?', [customer.id]);
    cekHutang(customer, { hutang: hutangBaru, payDebt });
  }

  const nomor = await nomorBaru(q);
  const sale = await q(
    `INSERT INTO sales (nomor, user_id, shift_id, customer_id, channel, status, total, paid_cash, paid_ewallet, paid_transfer, pay_old_debt, hutang)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
    [nomor, userId, shiftId ?? null, customer?.id ?? null, channel === 'wholesale' ? 'wholesale' : 'retail',
      total, paidCash, paidEwallet, paidTransfer, payDebt, hutangBaru]
  );

  for (const l of lines) {
    await q(
      `INSERT INTO sale_items (sale_id, variant_id, product_name, color, unit_name, qty, factor, unit_price, discount_pct, subtotal, auto_pick, stok_dikurangi)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [sale.insertId, l.v.id, l.p.name, l.v.color, l.u.name, l.qty, l.u.factor, l.u.price, l.disc, l.subtotal, l.auto ? 1 : 0]
    );
  }
  return { saleId: sale.insertId, nomor, total, hutangBaru };
}

// Aturan hutang per nota. Dipanggil saat draf dibuat dan lagi saat dilunasi (data pembeli bisa sudah berubah).
function cekHutang(customer, { hutang, payDebt }) {
  if (payDebt > customer.total_hutang + EPS) throw new BadRequest('Pembayaran hutang lama melebihi sisa hutang');
  if (hutang > MAX_HUTANG_BARU && !customer.address) {
    throw new BadRequest('Hutang per nota maksimal Rp 200.000 untuk pembeli tanpa alamat tercatat. Isi alamat pembeli.');
  }
}

// Melunasi nota draf: kurangi stok (gagal bila tidak cukup, seluruh nota dibatalkan), catat hutang dan pembayaran hutang lama.
export async function lunasiNota(q, saleId, userId) {
  const [sale] = await q('SELECT * FROM sales WHERE id = ? FOR UPDATE', [saleId]);
  if (!sale) throw new BadRequest('Nota tidak ditemukan');
  if (sale.status !== 'draft') throw new BadRequest(`Nota sudah ${sale.status}`);

  const items = await q('SELECT * FROM sale_items WHERE sale_id = ? AND stok_dikurangi = 0 ORDER BY id', [sale.id]);
  for (const it of items) {
    if (!it.variant_id) continue;
    const butuh = it.qty * it.factor;
    const [v] = await q('SELECT * FROM variants WHERE id = ? FOR UPDATE', [it.variant_id]);
    if (v.stock < butuh - EPS) {
      throw new BadRequest(`Stok ${it.product_name} ${it.color} tidak cukup (sisa ${v.stock}). Kurangi jumlah atau batalkan nota.`);
    }
    await q('UPDATE variants SET stock = ? WHERE id = ?', [Math.max(0, v.stock - butuh), v.id]);
    await q('INSERT INTO stock_adjustments (variant_id, user_id, delta, note) VALUES (?, ?, ?, ?)', [
      v.id, userId, -butuh, `Penjualan nota ${sale.nomor ?? '#' + sale.id}`,
    ]);
    await q('UPDATE sale_items SET stok_dikurangi = 1 WHERE id = ?', [it.id]);
  }

  if (sale.customer_id) {
    const [customer] = await q('SELECT * FROM customers WHERE id = ? FOR UPDATE', [sale.customer_id]);
    cekHutang(customer, { hutang: sale.hutang, payDebt: sale.pay_old_debt });
    if (sale.pay_old_debt > 0) {
      await q('INSERT INTO debt_payments (customer_id, user_id, amount) VALUES (?, ?, ?)', [customer.id, userId, sale.pay_old_debt]);
    }
    if (sale.hutang > 0 || sale.pay_old_debt > 0) {
      await q(
        `UPDATE customers SET total_hutang = total_hutang + ? - ?,
           last_hutang_date = CASE WHEN ? > 0 THEN CURDATE() ELSE last_hutang_date END WHERE id = ?`,
        [sale.hutang, sale.pay_old_debt, sale.hutang, customer.id]
      );
    }
  } else if (sale.hutang > 0 || sale.pay_old_debt > 0) {
    throw new BadRequest('Nota berhutang tanpa pembeli');
  }

  await q("UPDATE sales SET status = 'lunas' WHERE id = ?", [sale.id]);
  const [c] = sale.customer_id ? await q('SELECT total_hutang FROM customers WHERE id = ?', [sale.customer_id]) : [];
  return { saleId: sale.id, sisaHutang: c ? c.total_hutang : 0 };
}

// Membatalkan nota draf. Stok belum berkurang, jadi tidak ada yang perlu dikembalikan.
// Nota lunas tidak dibatalkan di sini; koreksinya lewat retur.
export async function batalkanNota(q, saleId, userId, alasan) {
  if (!alasan?.trim()) throw new BadRequest('Alasan pembatalan wajib diisi');
  const [sale] = await q('SELECT * FROM sales WHERE id = ? FOR UPDATE', [saleId]);
  if (!sale) throw new BadRequest('Nota tidak ditemukan');
  if (sale.status !== 'draft') throw new BadRequest(`Hanya nota draf yang bisa dibatalkan (nota ini ${sale.status})`);
  await q("UPDATE sales SET status = 'batal', alasan_batal = ?, batal_oleh = ?, batal_pada = NOW() WHERE id = ?", [
    alasan.trim(), userId, sale.id,
  ]);
  return { saleId: sale.id };
}
