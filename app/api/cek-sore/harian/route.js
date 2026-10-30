import { query, queryOne, tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { BadRequest } from '@/lib/sales';

// Cek sore hari ini: hitungan lembaran, total pembulatan, dan e-wallet / transfer menurut sistem.
export async function GET() {
  const { error } = await requireApi();
  if (error) return error;
  const catat = await queryOne('SELECT * FROM cek_sore_harian WHERE tanggal = CURDATE()');
  const sistem = await queryOne(
    `SELECT COALESCE(SUM(pembulatan),0) AS pembulatan, COALESCE(SUM(paid_ewallet),0) AS ewallet, COALESCE(SUM(paid_transfer),0) AS transfer
     FROM sales WHERE status = 'lunas' AND DATE(created_at) = CURDATE()`
  );
  const draf = await query(
    `SELECT s.id, s.nomor, s.status, s.total, s.pembulatan, s.menunggu_sejak, c.name AS customer_name
     FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.status = 'draft' AND DATE(s.created_at) = CURDATE() ORDER BY s.id`
  );
  return Response.json({ catat: catat || null, sistem, draf });
}

// Simpan hitungan cek sore hari ini (boleh diisi ulang selama hari yang sama).
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  const lembar50 = Number(b.lembar50);
  const lembar100 = Number(b.lembar100);
  const mutasiEwallet = Number(b.mutasi_ewallet);
  const mutasiTransfer = Number(b.mutasi_transfer);

  try {
    await tx(async (q) => {
      if (!(lembar50 >= 0) || !(lembar100 >= 0) || !Number.isInteger(lembar50) || !Number.isInteger(lembar100)) {
        throw new BadRequest('Jumlah lembaran harus bilangan bulat');
      }
      if (!(mutasiEwallet >= 0) || !(mutasiTransfer >= 0)) throw new BadRequest('Total mutasi tidak valid');
      await q(
        `INSERT INTO cek_sore_harian (tanggal, lembar50, lembar100, mutasi_ewallet, mutasi_transfer, dicatat_oleh, dicatat_pada)
         VALUES (CURDATE(), ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE lembar50 = VALUES(lembar50), lembar100 = VALUES(lembar100),
           mutasi_ewallet = VALUES(mutasi_ewallet), mutasi_transfer = VALUES(mutasi_transfer),
           dicatat_oleh = VALUES(dicatat_oleh), dicatat_pada = NOW()`,
        [lembar50, lembar100, mutasiEwallet, mutasiTransfer, session.uid]
      );
    });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}
