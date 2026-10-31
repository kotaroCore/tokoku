// Retur sebagian atau seluruh barang dari satu nota.
// Tanpa "tukar": nilai retur memotong hutang nota (yang belum lunas), sisanya dikembalikan lewat refund_method.
// Dengan "tukar": nilai retur dipakai sebagai pembayaran nota baru (barang pengganti); selisihnya dibayar
// lewat paid_* di body, atau bila nilai retur lebih besar, kelebihannya dikembalikan lewat refund_method.
// Barang kondisi baik masuk stok jual; barang cacat masuk stok rusak.

import { BadRequest, buatNota, lunasiNota, tambahSaldo } from '@/lib/sales';
import { catatDompet } from '@/lib/dompet';

const METHODS = ['cash', 'ewallet', 'transfer', 'saldo'];
const KONDISI = ['baik', 'cacat'];
const BATAS_HARI = 7;
// Aturan retur yang boleh dilewati staf. Pengecualian wajib disertai catatan.
export const PENGECUALIAN = ['lewat_7_hari', 'tanpa_nota_asli', 'paket_dibuka', 'diskon', 'benang_beda_warna', 'meteran'];

export async function prosesRetur(q, { userId, shiftId }, b) {
  const lines = (b.items || []).filter((i) => Number(i.qty) > 0);
  if (!lines.length) throw new BadRequest('Pilih barang yang diretur');
  const method = METHODS.includes(b.refund_method) ? b.refund_method : 'cash';
  if ((b.pengecualian || []).some((p) => !PENGECUALIAN.includes(p))) throw new BadRequest('Pengecualian tidak dikenal');
  const pengecualian = [...new Set(b.pengecualian || [])];
  const tukar = (b.tukar || []).filter((l) => Number(l.qty) > 0);
  const catatan = (b.note || '').trim();

  // Kunci nota supaya dua retur bersamaan tidak melebihi jumlah yang dibeli.
  const [sale] = await q('SELECT *, DATEDIFF(CURDATE(), DATE(created_at)) AS umur FROM sales WHERE id = ? FOR UPDATE', [b.sale_id]);
  if (!sale) throw new BadRequest('Nota tidak ditemukan');
  if (sale.status !== 'lunas') throw new BadRequest(`Retur hanya untuk nota lunas (nota ini ${sale.status})`);

  // Aturan 7 hari: lewat dari batas hanya boleh dengan pengecualian dan catatan.
  if (sale.umur > BATAS_HARI && !pengecualian.includes('lewat_7_hari')) {
    throw new BadRequest(`Nota sudah lewat ${BATAS_HARI} hari. Pilih pengecualian "lewat 7 hari" dan isi catatan.`);
  }
  if (pengecualian.length && !catatan) throw new BadRequest('Retur dengan pengecualian wajib diisi catatan');
  if (method === 'saldo' && !sale.customer_id) throw new BadRequest('Nota tanpa pembeli tidak bisa dikembalikan ke saldo titipan');

  let total = 0;
  const done = [];
  const seen = new Set();
  for (const l of lines) {
    if (seen.has(l.sale_item_id)) throw new BadRequest('Barang yang sama dikirim dua kali');
    seen.add(l.sale_item_id);
    const kondisi = l.kondisi || 'baik';
    if (!KONDISI.includes(kondisi)) throw new BadRequest('Kondisi barang tidak valid');
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
    done.push({ it, qty, amount, kondisi });
  }

  let hutangReduced = 0;
  let tukarDipakai = 0;
  let tukarNota = null;
  if (tukar.length) {
    // Barang pengganti: nota baru, nilai retur sebagai pembayaran pertama.
    const [pemilik] = sale.customer_id ? await q('SELECT name FROM customers WHERE id = ?', [sale.customer_id]) : [];
    tukarNota = await buatNota(q, {
      userId,
      shiftId,
      items: tukar.map((l) => ({ variant_id: Number(l.variant_id), unit_id: Number(l.unit_id), qty: Number(l.qty), auto: false })),
      channel: 'retail',
      customerName: (b.customer_name || '').trim() || pemilik?.name || '',
      customerPhone: b.customer_phone,
      customerAddress: b.customer_address,
      paidCash: Number(b.paid_cash) || 0,
      paidEwallet: Number(b.paid_ewallet) || 0,
      paidEwalletKet: (b.paid_ewallet_ket || '').trim(),
      paidTransfer: Number(b.paid_transfer) || 0,
      paidSaldo: Number(b.paid_saldo) || 0,
      paidTukar: total,
      payDebt: 0,
    });
    tukarDipakai = Math.min(total, tukarNota.total);
    await q('UPDATE sales SET paid_tukar = ? WHERE id = ?', [tukarDipakai, tukarNota.saleId]);
    // Selisih e-wallet / transfer menunggu konfirmasi: nota pengganti dilunasi dari Riwayat nanti.
    if (!tukarNota.menunggu) await lunasiNota(q, tukarNota.saleId, userId);
  } else if (sale.customer_id) {
    // Hutang nota yang belum dikurangi lewat retur atau pembayaran sebelumnya.
    const [{ reduced }] = await q('SELECT COALESCE(SUM(hutang_reduced),0) AS reduced FROM sale_returns WHERE sale_id = ?', [sale.id]);
    const [c] = await q('SELECT * FROM customers WHERE id = ? FOR UPDATE', [sale.customer_id]);
    hutangReduced = Math.max(0, Math.min(total, sale.hutang - reduced - sale.hutang_terbayar, c.total_hutang));
    if (hutangReduced > 0) await q('UPDATE customers SET total_hutang = total_hutang - ? WHERE id = ?', [hutangReduced, c.id]);
  }
  const refund = total - hutangReduced - tukarDipakai;

  const r = await q(
    `INSERT INTO sale_returns (sale_id, user_id, shift_id, total, hutang_reduced, refund_amount, refund_method, restock, note, pengecualian, tukar_nota_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [sale.id, userId, shiftId ?? null, total, hutangReduced, refund, method, catatan || null,
      pengecualian.join(',') || null, tukarNota?.saleId ?? null]
  );
  for (const d of done) {
    await q('INSERT INTO sale_return_items (return_id, sale_item_id, qty, amount, kondisi) VALUES (?, ?, ?, ?, ?)', [r.insertId, d.it.id, d.qty, d.amount, d.kondisi]);
    const back = d.qty * d.it.factor;
    // Barang cacat, atau yang memang dijual sebagai barang rusak, kembali ke stok rusak.
    const rusak = d.kondisi === 'cacat' || !!d.it.dari_rusak;
    const kolomStok = rusak ? 'stok_rusak' : 'stock';
    await q(`UPDATE variants SET ${kolomStok} = ${kolomStok} + ? WHERE id = ?`, [back, d.it.variant_id]);
    await q('INSERT INTO stock_adjustments (variant_id, user_id, delta, note, kolom) VALUES (?, ?, ?, ?, ?)', [
      d.it.variant_id, userId, back, `Retur nota ${sale.nomor ?? '#' + sale.id}${rusak ? ' (cacat)' : ''}`, rusak ? 'rusak' : 'jual',
    ]);
  }
  if (refund > 0 && method === 'cash') {
    await catatDompet(q, { dompet: 'laci', jumlah: -refund, jenis: 'retur', keterangan: sale.nomor, userId, saleId: sale.id });
  }
  if (refund > 0 && method === 'saldo') {
    await tambahSaldo(q, sale.customer_id, refund, userId, { jenis: 'retur', saleId: sale.id, returnId: r.insertId, note: sale.nomor });
  }
  return {
    id: r.insertId, total, hutangReduced, refund, method,
    tukarNota: tukarNota ? { saleId: tukarNota.saleId, nomor: tukarNota.nomor, total: tukarNota.total, menunggu: tukarNota.menunggu } : null,
  };
}
