import { tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { buangRusak } from '@/lib/rusak';
import { galat } from '@/lib/galat';

// Buang barang rusak (admin atau staf berizin). Body: { variant_id, qty, alasan }.
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const b = await req.json();
  try {
    const r = await tx((q) => buangRusak(q, session, { variantId: Number(b.variant_id), qty: Number(b.qty), alasan: b.alasan }));
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return galat(e);
  }
}
