import { requireApi } from '@/lib/auth';
import { pergerakanStok } from '@/lib/laporan';

const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

// Pergerakan stok satu produk (opsional satu warna) di rentang tanggal, dengan saldo berjalan.
export async function GET(req) {
  const { error } = await requireApi();
  if (error) return error;
  const sp = new URL(req.url).searchParams;
  const from = sp.get('from');
  const to = sp.get('to');
  if (!TANGGAL.test(from || '') || !TANGGAL.test(to || '')) return Response.json({ error: 'Format tanggal harus YYYY-MM-DD' }, { status: 400 });
  const d = await pergerakanStok(Number(sp.get('product_id')), from, to, Number(sp.get('variant_id')) || null);
  if (!d) return Response.json({ error: 'Produk tidak ditemukan' }, { status: 404 });
  return Response.json(d);
}
