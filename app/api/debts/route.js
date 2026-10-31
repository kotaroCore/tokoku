import { query, queryOne, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { bayarHutang } from '@/lib/sales';
import { catatDompet } from '@/lib/dompet';
import { catatBeda } from '@/lib/catatan';
import { getSettings } from '@/lib/settings';
import { notaBerhutang } from '@/lib/hutang';

// Pembeli yang masih berhutang, beserta nota yang belum lunas (nomor, tanggal, jatuh tempo, sisa),
// dan teks pengingat WhatsApp dari pengaturan. ?config=1: hanya pengaturan (untuk kasir).
export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const s = await getSettings();
  const config = { tempo_hari: Number(s.hutang_tempo_hari) || 7, template: s.wa_pengingat, toko: s.nama_toko };
  if (new URL(req.url).searchParams.get('config') === '1') return Response.json(config);
  const customers = await query('SELECT * FROM customers WHERE total_hutang > 0 ORDER BY total_hutang DESC');
  const notas = await notaBerhutang(customers.map((c) => c.id));
  const rows = customers.map((c) => {
    const n = notas.filter((x) => x.customer_id === c.id);
    const lewat = n.filter((x) => x.lewat);
    return { ...c, notas: n, lewat_nota: lewat.length, lewat_tempo: lewat.reduce((t, x) => t + Number(x.sisa), 0) };
  });
  return Response.json({ ...config, rows });
}

// Bayar hutang tanpa belanja baru.
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const { customer_id, amount, metode } = await req.json();
  const amt = Number(amount);
  const c = await queryOne('SELECT * FROM customers WHERE id = ?', [customer_id]);
  if (!c) return Response.json({ error: 'Pembeli tidak ditemukan' }, { status: 404 });
  if (!(amt > 0) || !Number.isInteger(amt) || amt > c.total_hutang) {
    return Response.json({ error: 'Jumlah tidak valid (maks sesuai sisa hutang)' }, { status: 400 });
  }
  await tx(async (q) => {
    await bayarHutang(q, c.id, amt, session.uid);
    // Hanya pembayaran tunai yang masuk laci; e-wallet dan transfer tidak.
    if (!metode || metode === 'cash') {
      await catatDompet(q, { dompet: 'laci', jumlah: amt, jenis: 'bayar_hutang', keterangan: c.name, userId: session.uid });
    }
  });
  return Response.json({ ok: true });
}

// Perbarui kontak pembeli (nomor WA / alamat), atau tandai pembeli dikenal (tier B). Tercatat di catatan perubahan.
export async function PATCH(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  await tx(async (q) => {
    const [c] = await q('SELECT * FROM customers WHERE id = ? FOR UPDATE', [b.id]);
    if (!c) return;
    const baru = b.dikenal !== undefined ? { dikenal: b.dikenal ? 1 : 0 } : { phone: b.phone || null, address: b.address || null };
    await q(`UPDATE customers SET ${Object.keys(baru).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...Object.values(baru), c.id]);
    await catatBeda(q, { userId: session.uid, objek: 'pembeli', objekId: c.id, lama: c, baru });
  });
  return Response.json({ ok: true });
}
