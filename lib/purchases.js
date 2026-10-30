// Logika barang masuk (pembelian dari supplier).
// - Status: dalam perjalanan (stok belum bertambah), diterima, atau hilang.
// - Saat diterima: harga beli terakhir produk diperbarui. Bila berbeda dari sebelumnya, dibuat peringatan harga.
// - Stok bertambah hanya saat barang dimasukkan rak per warna (lihat /api/purchases/[id]/shelve).

const SELISIH_MINIMAL = 0.5; // rupiah per satuan dasar; selisih lebih kecil dianggap sama

// Terima barang: perbarui harga beli terakhir dan catat peringatan bila berubah.
// Dipanggil saat status pembelian menjadi diterima (baik saat dicatat maupun setelah dikirim).
export async function terimaBarang(q, purchaseId, userId, isOwner) {
  const items = await q('SELECT * FROM purchase_items WHERE purchase_id = ? AND product_id IS NOT NULL', [purchaseId]);
  for (const it of items) {
    const baru = Math.round((Number(it.unit_cost) / Number(it.factor)) * 100) / 100;
    const [p] = await q('SELECT * FROM products WHERE id = ? FOR UPDATE', [it.product_id]);
    if (!p) continue;
    const lama = Number(p.cost) || 0;
    if (lama > 0 && Math.abs(baru - lama) >= SELISIH_MINIMAL) {
      await q(
        'INSERT INTO harga_alert (product_id, purchase_id, lama, baru, dibuat_oleh) VALUES (?, ?, ?, ?, ?)',
        [p.id, purchaseId, lama, baru, userId]
      );
      // Peringatan dari staf disimpan sampai owner login: owner dapat pop-up lewat notice.
      if (!isOwner) {
        await q('INSERT INTO notices (kind, message) VALUES (?, ?)', [
          'info', `Harga beli ${p.name} berubah dari Rp ${Math.round(lama)} ke Rp ${Math.round(baru)} per ${p.base_unit}. Cek di Barang masuk.`,
        ]);
      }
    }
    await q('UPDATE products SET cost = ? WHERE id = ?', [baru, p.id]);
  }
}
