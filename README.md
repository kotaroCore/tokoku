# Tokoku

Aplikasi kasir (POS), stok per warna, dan pencatatan hutang untuk toko benang, furing, resleting, benik, dan kain. Dibangun dengan Next.js dan SQLite (`better-sqlite3`).

## Fitur
- Login per pengguna, dengan pencatatan shift (masuk dan keluar)
- Kasir: satuan ganda (biji, dosin, gross, meter), diskon otomatis yang bisa diubah, bayar campuran (cash, e-wallet, transfer, hutang), channel retail dan grosir, nota yang bisa dicetak
- Hutang: pengingat saat nama pembeli diinput, bayar hutang lama bersamaan dengan belanja, batas Rp 200.000 per nota untuk pembeli tanpa alamat, pengingat via WhatsApp (manual)
- Stok per warna dengan peringatan 3 level (hijau, kuning, merah) dan penyesuaian stok
- Laporan harian: omset, metode bayar, produk terlaris, per kasir, riwayat shift

## Menjalankan
```bash
npm install
npm run dev        # buka http://localhost:3000 sekali agar skema database dibuat
npm run seed       # isi 3 user dan contoh produk
```
User awal: `owner`, `kasir`, `gudang`. Password awal `tokoku123` (atur lewat `SEED_PASSWORD=... npm run seed`). **Ganti sebelum dipakai sungguhan.**

Untuk produksi, atur `SESSION_SECRET` (string acak panjang) lalu `npm run build && npm start`.

Data tersimpan di `data/tokoku.db` (tidak ikut git). Cadangkan file ini secara berkala.

## Catatan
- Aturan diskon otomatis ada di `lib/discount.js` dan masih perlu dikonfirmasi pemilik toko.
- Stok disimpan dalam satuan dasar (biji/meter/buah); faktor satuan jual mengonversinya.
