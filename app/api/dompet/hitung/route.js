import { tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { BadRequest } from '@/lib/sales';
import { DOMPET, catatDompet, saldoDompet } from '@/lib/dompet';

// Hitung fisik dompet: selisih terhadap perkiraan sistem dicatat sebagai mutasi tersendiri (tidak dihapus).
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const fisik = Number(b.fisik);

  try {
    const hasil = await tx(async (q) => {
      if (!DOMPET.includes(b.dompet)) throw new BadRequest('Dompet tidak dikenal');
      if (!Number.isFinite(fisik) || fisik < 0) throw new BadRequest('Jumlah hitungan tidak valid');
      const sistem = await saldoDompet(q, b.dompet);
      const selisih = Math.round(fisik - sistem);
      if (selisih) {
        await catatDompet(q, {
          dompet: b.dompet, jumlah: selisih, jenis: 'selisih',
          keterangan: `Hitung fisik Rp ${Math.round(fisik)} (sistem Rp ${Math.round(sistem)})`, userId: session.uid,
        });
      }
      return { sistem, fisik, selisih };
    });
    return Response.json({ ok: true, ...hasil });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}
