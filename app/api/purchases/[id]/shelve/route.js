import { tx } from '@/lib/db';
import { requireApi } from '@/lib/auth';

class BadRequest extends Error {}
const EPS = 1e-6;

// Masukkan barang dari nota pembelian ke rak, dibagi per warna. Stok tiap warna bertambah.
// Body: { item_id, lines: [{ variant_id, qty, factor? }] }. qty dalam satuan baris itu; factor = isi satuan tsb
// dalam satuan dasar (kosong = satuan yang tertulis di nota), jadi tiap warna boleh memakai satuan berbeda.
// Boleh dicicil, tetapi total yang dirak tidak boleh melebihi jumlah di nota.
export async function POST(req, { params }) {
  const { session, error } = await requireApi();
  if (error) return error;
  const { id } = await params;
  const b = await req.json();
  const lines = (b.lines || []).filter((l) => Number(l.qty) !== 0);
  if (!lines.length) return Response.json({ error: 'Isi jumlah minimal satu warna' }, { status: 400 });

  try {
    const result = await tx(async (q) => {
      const [item] = await q('SELECT * FROM purchase_items WHERE id = ? AND purchase_id = ? FOR UPDATE', [b.item_id, id]);
      if (!item) throw new BadRequest('Barang di nota tidak ditemukan');
      const [pembelian] = await q('SELECT status FROM purchases WHERE id = ?', [id]);
      if (pembelian.status !== 'diterima') throw new BadRequest('Barang belum diterima. Tandai diterima dulu sebelum masuk rak.');
      if (!item.product_id) throw new BadRequest('Barang ini sudah punya warna dari catatan lama');

      let add = 0;
      const seen = new Set();
      const done = [];
      for (const l of lines) {
        const qty = Number(l.qty);
        if (!(qty > 0)) throw new BadRequest('Jumlah per warna harus lebih dari 0');
        if (seen.has(l.variant_id)) throw new BadRequest('Warna yang sama terisi dua kali');
        seen.add(l.variant_id);
        const [v] = await q('SELECT * FROM variants WHERE id = ? AND product_id = ? FOR UPDATE', [l.variant_id, item.product_id]);
        if (!v) throw new BadRequest('Warna tidak termasuk produk ini');
        if (!v.active) throw new BadRequest(`Warna ${v.color} sudah dinonaktifkan`);
        const f = l.factor == null ? item.factor : Number(l.factor);
        if (!(f > 0)) throw new BadRequest('Faktor satuan tidak valid');
        const base = qty * f;
        add += base;
        done.push({ v, base });
      }
      const total = item.qty * item.factor;
      if (item.shelved + add > total + EPS) {
        throw new BadRequest(`Melebihi nota. Sisa yang belum dirak ${(total - item.shelved) / item.factor} ${item.unit_name}`);
      }

      for (const d of done) {
        await q('UPDATE variants SET stock = stock + ? WHERE id = ?', [d.base, d.v.id]);
        await q('INSERT INTO stock_adjustments (variant_id, user_id, delta, note) VALUES (?, ?, ?, ?)', [
          d.v.id, session.uid, d.base, `Masuk rak pembelian #${id}`,
        ]);
        await q('INSERT INTO purchase_shelf (purchase_item_id, variant_id, user_id, qty) VALUES (?, ?, ?, ?)', [
          item.id, d.v.id, session.uid, d.base,
        ]);
      }
      await q('UPDATE purchase_items SET shelved = shelved + ? WHERE id = ?', [add, item.id]);
      return { shelved: item.shelved + add, total };
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: 'Terjadi kesalahan di server' }, { status: 500 });
  }
}
