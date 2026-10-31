// Catatan perubahan data master (produk, satuan, warna, stok, pembeli, supplier, pengguna, pengaturan, izin).
// Ditulis di transaksi yang sama dengan perubahannya. Penjualan, retur, dan barang masuk tidak dicatat di sini
// karena sudah punya jejak sendiri.

export const OBJEK = ['produk', 'satuan', 'warna', 'stok', 'pembeli', 'supplier', 'pengguna', 'pengaturan', 'izin'];

// Hanya kolom yang berubah. Mengembalikan null bila tidak ada yang berubah.
export function beda(lama, baru, keys = Object.keys(baru)) {
  const a = {};
  const b = {};
  for (const k of keys) {
    const x = lama?.[k] ?? null;
    const y = baru?.[k] ?? null;
    if (String(x) !== String(y)) {
      a[k] = x;
      b[k] = y;
    }
  }
  return Object.keys(b).length ? { lama: a, baru: b } : null;
}

export async function catat(q, { userId, objek, objekId = null, aksi, lama = null, baru = null }) {
  await q(
    'INSERT INTO catatan_perubahan (user_id, objek, objek_id, aksi, lama, baru) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, objek, objekId, aksi, lama == null ? null : JSON.stringify(lama), baru == null ? null : JSON.stringify(baru)]
  );
}

// Catat bila ada yang berubah (aksi 'ubah').
export async function catatBeda(q, { userId, objek, objekId, lama, baru, keys, aksi = 'ubah' }) {
  const d = beda(lama, baru, keys);
  if (d) await catat(q, { userId, objek, objekId, aksi, ...d });
  return d;
}
