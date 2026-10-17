# Tokoku

Aplikasi kasir (POS), stok per warna, dan pencatatan hutang untuk toko benang, furing, resleting, benik, dan kain. Dibangun dengan Next.js dan MySQL/MariaDB (`mysql2`).

## Fitur
- Login per pengguna, dengan pencatatan shift (masuk dan keluar)
- Kasir: satuan ganda (biji, dosin, gross, meter), diskon otomatis yang bisa diubah, bayar campuran (cash, e-wallet, transfer, hutang), channel retail dan grosir, nota yang bisa dicetak
- Hutang: pengingat saat nama pembeli diinput, bayar hutang lama bersamaan dengan belanja, batas Rp 200.000 per nota untuk pembeli tanpa alamat, pengingat via WhatsApp (manual)
- Stok per warna dengan peringatan 3 level (hijau, kuning, merah) dan penyesuaian stok
- Laporan harian: omset, metode bayar, produk terlaris, per kasir, riwayat shift

## Menjalankan
1. Nyalakan MySQL (mis. XAMPP).
2. Salin `.env.example` menjadi `.env.local`, sesuaikan `DB_USER`, `DB_PASSWORD`, dan `DB_NAME`.
3. Jalankan:
```bash
npm install
npm run seed       # membuat database + tabel, lalu mengisi 3 user dan contoh produk
npm run dev        # http://localhost:3000
```
User awal: `owner`, `kasir`, `gudang`. Password awal `tokoku123` (atur lewat `SEED_PASSWORD=... npm run seed`). **Ganti sebelum dipakai sungguhan.**

Untuk produksi, atur `SESSION_SECRET` (string acak panjang) di `.env.local`, lalu `npm run build && npm start`. Cadangkan database secara berkala (mis. `mysqldump tokoku > backup.sql`).

## Catatan
- Aturan diskon otomatis ada di `lib/discount.js` dan masih perlu dikonfirmasi pemilik toko.
- Database dan tabel dibuat otomatis bila belum ada. Gunakan user MySQL khusus (bukan root) untuk produksi.
- Stok disimpan dalam satuan dasar (biji/meter/buah); faktor satuan jual mengonversinya.

## Logout otomatis & backup (panel → khusus owner)

- **Logout otomatis**: atur di Panel (default 15 menit, bisa dimatikan). Berlaku untuk semua peran. Shift tetap berjalan; login berikutnya di hari yang sama melanjutkan shift itu. Selama keranjang kasir terisi, logout ditunda dan owner mendapat pop-up; setelah jam tutup (default 16:00) tidak ditunda lagi.
- **Backup database**: seluruh tabel dalam satu snapshot `.sql.gz` (`mysqldump --single-transaction`). Otomatis (harian/6 jam/mingguan, dikejar bila PC sempat mati) atau manual lewat tombol "Backup sekarang". Simpan 30 hari. Arahkan folder ke folder Google Drive for Desktop agar naik ke Drive. Butuh `mysqldump` (XAMPP sudah ada; atau isi `MYSQLDUMP_PATH` di `.env.local`).
- **Restore** (sengaja bukan dari panel): hentikan aplikasi, lalu `npm run restore`. Kondisi database saat ini dibackup dulu (`-pra-restore`) sebelum ditimpa. Butuh klien `mysql` (atau `MYSQL_PATH`).
- Setelah memperbarui kode, **restart server** (`npm run dev`/`start`) agar tabel baru dibuat dan penjadwal backup aktif.
