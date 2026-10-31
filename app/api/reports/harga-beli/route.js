import { requireIzinApi } from '@/lib/auth';
import { riwayatHargaBeli } from '@/lib/laporan';

// Riwayat harga beli satu produk per tanggal barang masuk. Harga beli = modal, jadi butuh izin laporan laba.
export async function GET(req) {
  const { error } = await requireIzinApi('laporan_laba');
  if (error) return error;
  const id = Number(new URL(req.url).searchParams.get('product_id'));
  return Response.json(await riwayatHargaBeli(id));
}
