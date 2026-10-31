import { query, queryOne, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { BadRequest, tambahSaldo, pembeliDariNama } from '@/lib/sales';
import { galat } from '@/lib/galat';
import { catatDompet } from '@/lib/dompet';

// Saldo titipan satu pembeli beserta riwayat perubahannya.
export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const params = new URL(req.url).searchParams;
  // Cek sore: saldo titipan yang titipan terakhirnya sudah satu tahun lebih.
  if (params.get('stale') === '1') {
    const rows = await query(
      `SELECT c.id, c.name, c.phone, c.saldo, DATE(MAX(m.created_at)) AS titipan_terakhir
       FROM customers c JOIN saldo_mutasi m ON m.customer_id = c.id AND m.jumlah > 0
       WHERE c.saldo > 0
       GROUP BY c.id, c.name, c.phone, c.saldo
       HAVING MAX(m.created_at) < NOW() - INTERVAL 365 DAY
       ORDER BY titipan_terakhir`
    );
    return Response.json(rows);
  }
  const customerId = Number(params.get('customer_id'));
  const c = await queryOne('SELECT id, name, saldo FROM customers WHERE id = ?', [customerId]);
  if (!c) return Response.json({ error: 'Pembeli tidak ditemukan' }, { status: 404 });
  const mutasi = await query(
    `SELECT m.*, u.name AS oleh FROM saldo_mutasi m JOIN users u ON u.id = m.user_id
     WHERE m.customer_id = ? ORDER BY m.id DESC LIMIT 50`,
    [c.id]
  );
  return Response.json({ ...c, mutasi });
}

// Titip saldo: pembeli menyetor uang untuk dipakai di belanja berikutnya.
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const amount = Number(b.amount);

  try {
    const result = await tx(async (q) => {
      if (!(amount > 0)) throw new BadRequest('Jumlah titipan harus lebih dari 0');
      let [c] = b.customer_id
        ? await q('SELECT * FROM customers WHERE id = ? FOR UPDATE', [b.customer_id])
        : [];
      if (!c) {
        // Pembeli baru: nama wajib spesifik, sama seperti pembeli berhutang.
        const name = (b.customer_name || '').trim();
        if (!name) throw new BadRequest('Isi nama pembeli');
        c = await pembeliDariNama(q, { name, phone: b.customer_phone, address: b.customer_address, pembeliBaru: !!b.pembeli_baru });
      }
      await tambahSaldo(q, c.id, amount, session.uid, { jenis: 'titip', note: (b.note || '').trim() || null });
      // Titipan tunai masuk laci; titipan lewat e-wallet / transfer tidak.
      if (!b.metode || b.metode === 'cash') {
        await catatDompet(q, { dompet: 'laci', jumlah: amount, jenis: 'titip', keterangan: c.name, userId: session.uid });
      }
      const [{ saldo }] = await q('SELECT saldo FROM customers WHERE id = ?', [c.id]);
      return { saldo, customer_id: c.id };
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return galat(e);
  }
}
