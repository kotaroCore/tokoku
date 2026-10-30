import { query, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { BadRequest } from '@/lib/sales';
import { DOMPET, catatDompet, saldoDompet } from '@/lib/dompet';

// Saldo ketiga dompet dan mutasi terbaru.
export async function GET() {
  const { error } = await requireApi();
  if (error) return error;
  const saldo = await tx(async (q) => {
    const out = {};
    for (const d of DOMPET) out[d] = await saldoDompet(q, d);
    return out;
  });
  const mutasi = await query(
    `SELECT m.*, u.name AS oleh FROM dompet_mutasi m JOIN users u ON u.id = m.user_id ORDER BY m.id DESC LIMIT 50`
  );
  return Response.json({ saldo, mutasi });
}

// Uang keluar dari dompet (jamu, GoSend, bayar supplier tunai, dll.).
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const jumlah = Number(b.jumlah);
  const keterangan = String(b.keterangan || '').trim();

  try {
    await tx(async (q) => {
      if (!DOMPET.includes(b.dompet)) throw new BadRequest('Dompet tidak dikenal');
      if (!(jumlah > 0) || !Number.isInteger(jumlah)) throw new BadRequest('Jumlah harus bilangan bulat lebih dari 0');
      if (!keterangan) throw new BadRequest('Keterangan wajib diisi (mis. jamu, GoSend)');
      await catatDompet(q, { dompet: b.dompet, jumlah: -jumlah, jenis: 'pengeluaran', keterangan, userId: session.uid });
    });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}
