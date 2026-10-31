import { BadRequest } from '@/lib/sales';
import { Forbidden } from '@/lib/izin';

// Ubah galat dari lib/ menjadi respons API: aturan dilanggar (400), tanpa izin (403), lainnya (500).
export function galat(e) {
  if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
  if (e instanceof Forbidden) return Response.json({ error: e.message }, { status: 403 });
  console.error(e);
  return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
}
