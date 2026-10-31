// Logika nota penjualan: draf -> lunas / batal.
// - Draf tidak menyentuh stok. Stok berkurang saat nota dilunasi, dan ditolak bila tidak cukup.
// - Hutang dan pembayaran hutang lama baru tercatat di pelanggan saat nota lunas.
// - Nota batal dan nota lunas tidak dihapus.

import { catatDompet } from '@/lib/dompet';
import { cariMirip, NamaMirip } from '@/lib/pembeli';
import { getSettings } from '@/lib/settings';
import { rapikanLokasi } from '@/lib/lokasi';

export class BadRequest extends Error {}

const MAX_HUTANG_BARU = 200000;
const MAX_HUTANG_DIKENAL = 500000;
const BATAS_HUTANG_LAMA = 100000;
const EPS = 1e-9;
const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

// Pembeli baru dibuat dari nama yang diketik kasir. Bila ada nama mirip, kasir harus memilih:
// pakai pembeli yang sudah ada, atau tetap buat baru (pembeliBaru = true).
export async function pembeliDariNama(q, { name, phone, address, pembeliBaru }) {
  let [c] = await q('SELECT * FROM customers WHERE name = ? FOR UPDATE', [name]);
  if (c) return c;
  if (!pembeliBaru) {
    const mirip = await cariMirip(q, name);
    if (mirip.length) throw new NamaMirip(name, mirip);
  }
  const r = await q('INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)', [name, phone || null, address || null]);
  [c] = await q('SELECT * FROM customers WHERE id = ?', [r.insertId]);
  return c;
}

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
export async function buatNota(q, { userId, shiftId, items, channel, customerName, customerPhone, customerAddress, pembeliBaru = false, paidCash, paidEwallet, paidEwalletKet = '', paidTransfer, paidSaldo = 0, paidTukar = 0, pembulatan = 0, payDebt, jatuhTempo = null }) {
  if (jatuhTempo && !TANGGAL.test(jatuhTempo)) throw new BadRequest('Tanggal jatuh tempo tidak valid');
  if (!Number.isInteger(pembulatan)) throw new BadRequest('Pembulatan harus bilangan bulat');
  if (paidEwallet > 0 && !paidEwalletKet) throw new BadRequest('Pembayaran e-wallet wajib diisi keterangan (QRIS, GoPay, ShopeePay, atau lainnya)');
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
    // Barang rusak: stok yang dipakai stok_rusak, harga per satuan diketik kasir (boleh turun bebas), tanpa diskon.
    const rusak = !!it.dari_rusak;
    const sisa = rusak ? v.stok_rusak : v.stock;
    const sudahDiKeranjang = lines.filter((l) => l.v.id === v.id && l.rusak === rusak).reduce((s, l) => s + l.need, 0);
    const need = qty * u.factor;
    if (sisa < sudahDiKeranjang + need - EPS) {
      throw new BadRequest(`Stok${rusak ? ' rusak' : ''} ${p.name} ${v.color} tidak cukup (sisa ${sisa} ${p.base_unit})`);
    }
    let price = u.price;
    if (rusak) {
      price = Math.round(Number(it.harga));
      if (!(price >= 0)) throw new BadRequest(`Isi harga barang rusak ${p.name}`);
    }
    // Diskon dalam rupiah per baris (diskon otomatis persen sudah diubah ke rupiah oleh kasir).
    // discount_pct hanya untuk pemanggil lama: dihitung jadi rupiah di sini. Barang rusak tanpa diskon.
    let diskon = 0;
    if (!rusak) {
      diskon = it.diskon_rp != null ? Number(it.diskon_rp) : Math.round(qty * price * Math.min(100, Math.max(0, Number(it.discount_pct) || 0)) / 100);
      if (!Number.isInteger(diskon) || diskon < 0) throw new BadRequest('Diskon harus rupiah bulat, tidak negatif');
    }
    lines.push({ v, p, u, qty, price, rusak, diskon, grup: it.grup ?? '', subtotal: 0, need, auto: !rusak && !!it.auto });
  }
  // Satu penjualan yang dipecah ke beberapa warna (grup yang sama) dihitung sebagai satu kelompok:
  // dibulatkan sekali, selisih pembulatan ke baris terakhir, supaya 1 dosin tidak jadi Rp 23.001.
  const groups = new Map();
  for (const l of lines) {
    const key = `${l.p.id}:${l.u.id}:${l.price}:${l.rusak ? 'r' : ''}:${l.grup}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  for (const g of groups.values()) {
    const kotor = Math.round(g.reduce((s, l) => s + l.qty * l.price, 0));
    const diskon = g.reduce((s, l) => s + l.diskon, 0);
    if (diskon > kotor) throw new BadRequest(`Diskon ${g[0].p.name} melebihi harganya`);
    let rest = kotor - diskon;
    g.forEach((l, i) => {
      l.subtotal = i === g.length - 1 ? rest : Math.round(l.qty * l.price) - l.diskon;
      rest -= l.subtotal;
    });
  }
  for (const l of lines) total += l.subtotal;

  // Uang yang masuk dipakai untuk membayar hutang lama dulu, sisanya untuk belanja ini.
  // paidSaldo: dari saldo titipan pembeli. paidTukar: nilai barang yang ditukar (retur).
  const paid = paidCash + paidEwallet + paidTransfer + paidSaldo + paidTukar;
  const forThisSale = Math.max(0, paid - payDebt);
  // Tagihan = total barang + pembulatan manual staf (selisih dicatat, tidak otomatis).
  const tagihan = total + pembulatan;
  if (tagihan < 0) throw new BadRequest('Tagihan tidak boleh negatif');
  const hutangBaru = Math.max(0, tagihan - forThisSale);
  // Pembayaran e-wallet / transfer belum pasti masuk: nota menunggu konfirmasi dan tetap draf.
  const menunggu = paidEwallet > 0 || paidTransfer > 0;

  let [customer] = customerName ? await q('SELECT * FROM customers WHERE name = ? FOR UPDATE', [customerName]) : [];
  if (hutangBaru > 0 || payDebt > 0) {
    if (!customerName) throw new BadRequest('Nama pembeli wajib diisi untuk hutang / bayar hutang');
    if (!customer) customer = await pembeliDariNama(q, { name: customerName, phone: customerPhone, address: customerAddress, pembeliBaru });
    // Data pembeli dilengkapi sekarang; hutang dan pembayaran hutang lama dicatat saat nota lunas.
    await q('UPDATE customers SET phone = COALESCE(?, phone), address = COALESCE(?, address) WHERE id = ?', [
      customerPhone || null, customerAddress || null, customer.id,
    ]);
    [customer] = await q('SELECT * FROM customers WHERE id = ?', [customer.id]);
    cekHutang(customer, { hutang: hutangBaru, payDebt });
  }

  if (paidSaldo > 0) {
    if (!customer) throw new BadRequest('Pembayaran dengan saldo titipan wajib memakai nama pembeli');
    if (paidSaldo > customer.saldo + EPS) throw new BadRequest(`Saldo titipan tidak cukup (sisa Rp ${Math.round(customer.saldo).toLocaleString('id-ID')})`);
  }

  const nomor = await nomorBaru(q);
  const sale = await q(
    `INSERT INTO sales (nomor, user_id, shift_id, customer_id, channel, status, total, paid_cash, paid_ewallet, ewallet_ket, paid_transfer, paid_saldo, paid_tukar, pay_old_debt, hutang, pembulatan)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [nomor, userId, shiftId ?? null, customer?.id ?? null, channel === 'wholesale' ? 'wholesale' : 'retail',
      total, paidCash, paidEwallet, paidEwalletKet || null, paidTransfer, paidSaldo, paidTukar, payDebt, hutangBaru, pembulatan]
  );

  for (const l of lines) {
    await q(
      `INSERT INTO sale_items (sale_id, variant_id, product_name, color, unit_name, qty, factor, unit_price, discount_pct, subtotal, auto_pick, stok_dikurangi, dari_rusak, modal, diskon_rp, diskon_oleh)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, ?, ?, ?)`,
      [sale.insertId, l.v.id, l.p.name, l.v.color, l.u.name, l.qty, l.u.factor, l.price, l.subtotal, l.auto ? 1 : 0, l.rusak ? 1 : 0, Number(l.p.cost) || 0,
        l.diskon, l.diskon > 0 ? userId : null]
    );
  }
  if (menunggu) await q('UPDATE sales SET menunggu_sejak = NOW() WHERE id = ?', [sale.insertId]);
  // Jatuh tempo pilihan kasir disimpan sekarang; bila kosong diisi bawaan saat nota lunas.
  if (hutangBaru > 0 && jatuhTempo) {
    const [{ lalu }] = await q('SELECT ? < CURDATE() AS lalu', [jatuhTempo]);
    if (lalu) throw new BadRequest('Jatuh tempo tidak boleh sebelum hari ini');
    await q('UPDATE sales SET jatuh_tempo = ? WHERE id = ?', [jatuhTempo, sale.insertId]);
  }
  return { saleId: sale.insertId, nomor, total, hutangBaru, menunggu };
}

// Aturan hutang per tier:
//   - tier B (dikenal staf): hutang per nota maks Rp 500.000, boleh berhutang lagi meski hutang lama ada.
//   - tier A (ada nama, belum dikenal): hutang per nota maks Rp 200.000; bila sisa hutang lama
//     Rp 100.000 atau lebih, hutang baru ditolak sampai dilunasi dulu.
// Dipanggil saat draf dibuat dan lagi saat dilunasi (data pembeli bisa sudah berubah).
function cekHutang(customer, { hutang, payDebt }) {
  if (payDebt > customer.total_hutang + EPS) throw new BadRequest('Pembayaran hutang lama melebihi sisa hutang');
  if (hutang <= 0) return;
  if (customer.dikenal) {
    if (hutang > MAX_HUTANG_DIKENAL) throw new BadRequest('Hutang per nota maksimal Rp 500.000');
    return;
  }
  if (hutang > MAX_HUTANG_BARU) {
    throw new BadRequest('Hutang per nota maksimal Rp 200.000 untuk pembeli yang belum dikenal. Tandai pembeli dikenal bila sudah kenal.');
  }
  const sisaLama = customer.total_hutang - payDebt;
  if (sisaLama >= BATAS_HUTANG_LAMA - EPS) {
    throw new BadRequest(`Hutang lama Rp ${Math.round(sisaLama).toLocaleString('id-ID')} harus dilunasi dulu sebelum berhutang lagi`);
  }
}

// Saldo titipan pembeli: positif = titip / refund retur, negatif = dipakai bayar nota.
// Setiap perubahan dicatat di saldo_mutasi. Pemanggil mengunci baris pembeli (FOR UPDATE) bila perlu cek saldo.
export async function tambahSaldo(q, customerId, jumlah, userId, { jenis, saleId = null, returnId = null, note = null }) {
  await q('UPDATE customers SET saldo = saldo + ? WHERE id = ?', [jumlah, customerId]);
  await q(
    'INSERT INTO saldo_mutasi (customer_id, jumlah, jenis, sale_id, return_id, user_id, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [customerId, jumlah, jenis, saleId, returnId, userId, note]
  );
}

// Pembayaran hutang: dicatat di debt_payments dan dibagi ke nota yang paling lama dulu.
// Hanya nota lunas yang punya sisa hutang (dikurangi retur) yang dihitung.
export async function bayarHutang(q, customerId, amount, userId) {
  await q('INSERT INTO debt_payments (customer_id, user_id, amount) VALUES (?, ?, ?)', [customerId, userId, amount]);
  let sisa = amount;
  const notas = await q(
    `SELECT s.id, s.hutang - s.hutang_terbayar - COALESCE((SELECT SUM(r.hutang_reduced) FROM sale_returns r WHERE r.sale_id = s.id), 0) AS sisa
     FROM sales s WHERE s.customer_id = ? AND s.status = 'lunas' AND s.hutang > 0
     ORDER BY s.created_at, s.id FOR UPDATE`,
    [customerId]
  );
  for (const n of notas) {
    if (sisa <= EPS) break;
    const dibayar = Math.min(sisa, Math.max(0, Number(n.sisa)));
    if (dibayar <= EPS) continue;
    await q('UPDATE sales SET hutang_terbayar = hutang_terbayar + ? WHERE id = ?', [dibayar, n.id]);
    sisa -= dibayar;
  }
  await q('UPDATE customers SET total_hutang = total_hutang - ? WHERE id = ?', [amount, customerId]);
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
    // Baris barang rusak mengurangi stok rusak, bukan stok jual.
    const field = it.dari_rusak ? 'stok_rusak' : 'stock';
    if (v[field] < butuh - EPS) {
      throw new BadRequest(`Stok${it.dari_rusak ? ' rusak' : ''} ${it.product_name} ${it.color} tidak cukup (sisa ${v[field]}). Kurangi jumlah atau batalkan nota.`);
    }
    await q(`UPDATE variants SET ${field} = ? WHERE id = ?`, [Math.max(0, v[field] - butuh), v.id]);
    if (!it.dari_rusak) await rapikanLokasi(q, v.id); // diambil dari tempat 1 dulu, lalu 2, lalu 3
    await q('INSERT INTO stock_adjustments (variant_id, user_id, delta, note, kolom, jenis) VALUES (?, ?, ?, ?, ?, ?)', [
      v.id, userId, -butuh, `Penjualan nota ${sale.nomor ?? '#' + sale.id}${it.dari_rusak ? ' (rusak)' : ''}`,
      it.dari_rusak ? 'rusak' : 'jual', it.dari_rusak ? 'jual_rusak' : 'jual',
    ]);
    await q('UPDATE sale_items SET stok_dikurangi = 1 WHERE id = ?', [it.id]);
  }

  if (sale.customer_id) {
    const [customer] = await q('SELECT * FROM customers WHERE id = ? FOR UPDATE', [sale.customer_id]);
    cekHutang(customer, { hutang: sale.hutang, payDebt: sale.pay_old_debt });
    if (sale.paid_saldo > 0) {
      if (customer.saldo < sale.paid_saldo - EPS) throw new BadRequest('Saldo titipan tidak cukup');
      await tambahSaldo(q, customer.id, -sale.paid_saldo, userId, { jenis: 'pakai', saleId: sale.id, note: sale.nomor });
    }
    // Pembayaran hutang lama dulu (nota ini belum lunas, jadi tidak ikut dibagi), baru hutang baru.
    if (sale.pay_old_debt > 0) await bayarHutang(q, customer.id, sale.pay_old_debt, userId);
    if (sale.hutang > 0) {
      await q(
        `UPDATE customers SET total_hutang = total_hutang + ?, last_hutang_date = CURDATE() WHERE id = ?`,
        [sale.hutang, customer.id]
      );
      // Setiap nota berhutang punya jatuh tempo: pilihan kasir, atau hari ini + hutang_tempo_hari.
      if (!sale.jatuh_tempo) {
        const hari = Math.max(0, Number((await getSettings()).hutang_tempo_hari) || 7);
        await q('UPDATE sales SET jatuh_tempo = CURDATE() + INTERVAL ? DAY WHERE id = ?', [hari, sale.id]);
      }
    }
  } else if (sale.hutang > 0 || sale.pay_old_debt > 0) {
    throw new BadRequest('Nota berhutang tanpa pembeli');
  }

  // Uang tunai masuk ke laci. Kembalian (dari uang masuk tunai dikurangi tagihan, termasuk pembayaran hutang lama) diambil dari dompet receh.
  const uangMasuk = sale.paid_cash + sale.paid_ewallet + sale.paid_transfer + sale.paid_saldo + sale.paid_tukar;
  const sisa = uangMasuk - sale.pay_old_debt - (sale.total + sale.pembulatan);
  const kembalian = Math.min(sale.paid_cash, Math.max(0, sisa));
  await q('UPDATE sales SET kembalian = ? WHERE id = ?', [kembalian, sale.id]);
  await catatDompet(q, { dompet: 'laci', jumlah: sale.paid_cash, jenis: 'penjualan', keterangan: sale.nomor, userId, saleId: sale.id });
  await catatDompet(q, { dompet: 'receh', jumlah: -kembalian, jenis: 'kembalian', keterangan: sale.nomor, userId, saleId: sale.id });

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
