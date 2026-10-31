import { BadRequest } from '@/lib/sales';
import { Forbidden } from '@/lib/izin';
import { NamaMirip } from '@/lib/pembeli';

// Ubah galat dari lib/ menjadi respons API: aturan dilanggar (400), tanpa izin (403), lainnya (500).
export function galat(e) {
  if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
  if (e instanceof Forbidden) return Response.json({ error: e.message }, { status: 403 });
  // Nama pembeli baru mirip yang sudah ada: layar menawarkan pilihan (pakai yang ada / tetap buat baru).
  if (e instanceof NamaMirip) return Response.json({ error: e.message, mirip: e.mirip }, { status: 409 });
  console.error(e);
  return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
}
