import { query } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { cariMirip } from '@/lib/pembeli';
import { notaBerhutang } from '@/lib/hutang';

export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const sp = new URL(req.url).searchParams;
  // ?mirip=nama: pembeli aktif dengan nama mirip (cek sebelum membuat pembeli baru).
  if (sp.has('mirip')) return Response.json(await cariMirip(query, sp.get('mirip')));
  const q = sp.get('q')?.trim() || '';
  const rows = q
    ? await query('SELECT * FROM customers WHERE name LIKE ? ORDER BY name LIMIT 10', [`%${q}%`])
    : await query('SELECT * FROM customers ORDER BY name LIMIT 100');
  // Hutang yang sudah lewat jatuh tempo, untuk peringatan di kasir.
  const notas = await notaBerhutang(rows.filter((c) => c.total_hutang > 0).map((c) => c.id));
  return Response.json(rows.map((c) => {
    const lewat = notas.filter((n) => n.customer_id === c.id && n.lewat);
    return { ...c, lewat_nota: lewat.length, lewat_tempo: lewat.reduce((t, n) => t + Number(n.sisa), 0) };
  }));
}
