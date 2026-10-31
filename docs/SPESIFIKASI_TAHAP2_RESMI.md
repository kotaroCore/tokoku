# Tokoku: Spesifikasi Tahap 2 (Resmi)

Tanggal: 31 Oktober 2026
Dokumen ini menggantikan `SPESIFIKASI_TAHAP2.md` dan `TAHAP2.md` sebagai acuan tahap 2. Keputusan pemilik sudah dimasukkan. Bagian "Belum diputuskan" di akhir dokumen harus diselesaikan sebelum milestone terkait dikerjakan.

---

## 1. Ringkasan

Tahap 2 menyelesaikan pekerjaan tahap 1 yang tersisa, lalu menambah hak akses (admin), tindak lanjut stok rusak, hutang dengan jatuh tempo, laporan lanjutan, diskon rupiah, input stok awal bertahap, dan lokasi rak dengan opname per warna.

| Milestone | Isi | Status |
|---|---|---|
| M0 | Penyamaan dokumen, hapus skema ganda (arsip), uji otomatis | Siap dikerjakan |
| M1 | Peran admin, hak ubah harga, catatan perubahan | Siap dikerjakan |
| M2 | Tindak lanjut stok rusak (jual, buang, retur ke supplier) | Siap dikerjakan |
| M3 | Hutang: jatuh tempo, nama mirip, teks WhatsApp | Siap dikerjakan |
| M4 | Laporan lanjutan, riwayat harga beli, ekspor PDF, tampilan HP | Siap dikerjakan |
| M5 | Diskon rupiah, input stok awal bertahap | Siap dikerjakan |
| M6 | PO ke supplier, lokasi rak dan opname per warna | Siap dikerjakan |
| Nanti | PPh/PPN, redenominasi, pindah ke VPS, toko online (fase 3) | Di luar tahap 2 |

Urutan pengerjaan mengikuti nomor milestone: M0, M1, M2, M3, M4, M5, M6.

**Aturan yang tetap berlaku dari tahap 1:**
- Data (produk, pengguna, supplier, pembeli) tidak dihapus, hanya dinonaktifkan.
- Kasir tidak menampilkan warna. Warna diisi saat cek sore.
- Pembelian ke supplier selalu lunas. Tidak ada hutang supplier.
- Stok jual dan stok rusak tidak boleh minus. Hutang dan saldo titipan tidak boleh minus.
- Stok toko dan gudang tetap digabung dalam satu angka per warna.
- Skema dibuat dan diubah lewat `SCHEMA` dan `MIGRATIONS` di `lib/db.js`. Setiap kolom baru ditambah sebagai migrasi.

**Perubahan dari rancangan sebelumnya:**
- Uang disimpan sebagai `BIGINT` (rupiah utuh), bukan `DECIMAL(14,2)`. Jumlah stok tetap dalam satuan dasar.
- Peran ibu dihapus. Akun ibu menjadi staf.
- Diskon ditampilkan dalam rupiah saja, tanpa persen, di layar maupun nota.

**Hutang tahap 1** yang harus selesai sebelum tahap 1 dinyatakan selesai (kriteria di MVP_TAHAP1 bagian 7):
- [ ] Ekspor laporan harian ke PDF (kriteria 6). Dikerjakan di M4.
- [ ] Uji lunas, batal, retur, dan barang masuk tanpa data rusak (kriteria 8). Dikerjakan di M0.
- [ ] Stok per warna dicocokkan dengan hitungan fisik sekali (kriteria 3). Pekerjaan di toko, dibantu input stok awal (M5) dan opname per warna (M6).

---

## 2. M0: Penyamaan dokumen dan kebersihan teknis

**Dokumen**
- Perbarui status di `MVP_TAHAP1.md`. Butir yang sudah berjalan tetapi masih tertulis "Belum" diubah menjadi "Sudah": nomor nota, status draf/lunas/batal, konfirmasi e-wallet dan transfer, pembulatan manual, tier pembeli, batas Rp 100.000 hutang lama, penanda dikenal, pelunasan urut nota tertua, saldo titipan, batas retur 7 hari, stok rusak terpisah, tukar barang, status kiriman barang masuk, nomor nota supplier, harga beli terakhir dan peringatannya, tiga dompet, uang keluar, hitung laci, dan cek sore lengkap.

**Satu skema**
- `lib/nota.js`, `db/schema_fase1.sql`, dan `SKEMA_DATABASE_FASE1.md` dipindah ke `docs/arsip/` dengan catatan bahwa itu rancangan awal.
- `db/migrasi_dari_prototipe.sql` diperiksa. Jika hanya menulis ke skema lama, ikut diarsipkan.

**Uji otomatis**
- `scripts/uji_nota.mjs` diganti `scripts/uji.mjs`. Memakai database uji terpisah (`DB_NAME=tokoku_uji`) yang dibuat dan dikosongkan setiap kali jalan, dan memanggil fungsi di `lib/` langsung. Memakai `node:test` dan `node:assert`. Dijalankan dengan `npm run uji`.

| Skenario | Yang dicek |
|---|---|
| Nota draf lalu lunas | Stok berkurang hanya saat lunas. Nomor nota berurutan per hari. |
| Nota dibatalkan | Stok, hutang, saldo, dan dompet kembali seperti semula. |
| Dua kasir menyimpan bersamaan | Nomor nota tidak kembar. |
| Pembayaran campuran | Cash, e-wallet, transfer, saldo, tukar, dan hutang berjumlah sama dengan tagihan. |
| Hutang tier A dan B | Batas Rp 200.000 dan Rp 500.000. Hutang lama di atas Rp 100.000 menolak hutang baru tier A. |
| Bayar hutang lama | Dibagi ke nota tertua dulu. |
| Retur sebagian | Tidak melebihi yang dibeli. Potong hutang dulu. Barang rusak masuk `stok_rusak`. |
| Tukar barang | Nilai retur menjadi pembayaran nota baru. |
| Barang masuk dicicil ke rak | Stok bertambah per warna sesuai yang dirak. Status hilang tidak menambah stok. |
| Stok tidak minus | Penjualan, koreksi, dan cek sore menolak stok di bawah nol. |
| Ubah harga oleh staf | Ditolak (403) kecuali staf punya izin admin. |
| Buang stok rusak oleh staf | Ditolak kecuali staf punya izin admin. |

**Selesai bila:** `MVP_TAHAP1.md` sesuai kode, hanya satu skema yang tersisa di luar arsip, dan `npm run uji` lolos untuk semua skenario di atas.

---

## 3. M1: Hak akses dan catatan perubahan

### 3.1 Peran

Kolom `users.role` menerima `admin` dan `staff`. Peran `owner` dihapus dan akun ibu menjadi `staff`.

| Kegiatan | Admin | Staf |
|---|---|---|
| Kasir, riwayat, retur, tukar, hutang, saldo | Ya | Ya |
| Cek stok, cek sore, barang masuk ke rak | Ya | Ya |
| Tambah produk, warna, satuan | Ya | Ya |
| Ubah harga jual dan harga satuan | Ya | Tidak, kecuali izin admin per orang |
| Ubah harga beli (modal), termasuk lewat barang masuk | Ya | Tidak, kecuali izin admin per orang |
| Koreksi stok | Ya | Ya, alasan wajib |
| Jual stok rusak tanpa izin | Ya | Ya |
| Buang stok rusak | Ya | Tidak, kecuali izin admin per orang |
| Tandai pembeli dikenal | Ya | Ya, tercatat |
| Laporan dan laba | Ya | Tidak, kecuali izin admin per orang |
| Panel (pengguna, izin, pengaturan, teks WhatsApp, backup) | Ya | Tidak |

**Aturan peran:**
- Minimal satu admin aktif harus selalu ada. Sistem menolak menonaktifkan admin terakhir.
- Izin diberikan admin per orang. Izin yang diberikan dicatat di catatan perubahan.
- Pemeriksaan dilakukan di API (`lib/auth.js`, `requireRoleApi(...roles)`), bukan hanya dengan menyembunyikan tombol. Di form produk, kolom harga tampil terkunci untuk staf tanpa izin.
- Pengguna tidak dihapus, hanya dinonaktifkan.

### 3.2 Catatan perubahan

Tabel baru `catatan_perubahan`:

| Kolom | Isi |
|---|---|
| `id` | |
| `user_id` | Siapa |
| `dibuat_pada` | Kapan |
| `objek` | `produk`, `satuan`, `warna`, `stok`, `pembeli`, `supplier`, `pengguna`, `pengaturan`, `izin` |
| `objek_id` | Baris yang diubah |
| `aksi` | `tambah`, `ubah`, `nonaktif`, `aktif`, `beri_izin`, `cabut_izin` |
| `lama`, `baru` | JSON berisi kolom yang berubah saja |

Ditulis di transaksi yang sama dengan perubahannya. Transaksi penjualan, retur, dan barang masuk tidak ikut dicatat di sini karena sudah punya jejak sendiri. Panel admin mendapat halaman "Catatan perubahan" dengan saring per objek, per pengguna, dan rentang tanggal.

**Selesai bila:** staf tanpa izin yang memanggil API ubah harga mendapat 403. Perubahan harga, koreksi stok, perubahan pengguna, dan pemberian izin muncul di halaman catatan dengan nilai lama dan baru.

---

## 4. M2: Tindak lanjut stok rusak

Kolom `variants.stok_rusak` sudah terisi dari retur barang cacat. M2 menambah tiga jalan keluar. Semuanya mengurangi `stok_rusak`, tidak menyentuh stok jual, dan tercatat di `stock_adjustments` dengan `kolom = 'rusak'`.

### 4.1 Jual barang rusak
- Semua staf boleh menjual tanpa izin admin.
- Di kasir, produk yang punya stok rusak mendapat pilihan "jual barang rusak".
- Baris nota diberi tanda `sale_items.dari_rusak = 1`. Harga boleh diturunkan bebas dan diketik manual, sesuai kesepakatan staf.
- Stok yang berkurang saat lunas adalah `stok_rusak`. Warna diambil dari stok rusak terbanyak.
- Nota tetap tanpa warna, tetapi baris ini ditandai "(rusak)" di nota.

### 4.2 Buang
- Hanya admin, atau staf dengan izin admin.
- Dari halaman Cek stok, tombol "Buang" pada baris yang punya stok rusak. Jumlah dan alasan wajib.
- Nilai yang dibuang (jumlah × harga beli) tampil di laporan sebagai kerugian.

### 4.3 Kembalikan ke supplier
Tabel baru `retur_supplier` (`id`, `supplier_id`, `user_id`, `status`, `nilai`, `catatan`, `dibuat_pada`, `selesai_pada`) dan `retur_supplier_item` (`retur_supplier_id`, `variant_id`, `qty`, `harga_beli`).
- Status `dikirim`: stok rusak langsung berkurang.
- Status `diganti`: supplier mengirim barang pengganti. Staf memasukkannya ke rak lewat alur barang masuk dengan total Rp 0 dan rujukan ke retur ini.
- Status `diuangkan`: uang masuk ke dompet kulakan sebagai `dompet_mutasi` jenis `retur_supplier`.
- Status `ditolak`: barang kembali ke stok rusak, lalu bisa dijual atau dibuang.

Halaman Supplier menampilkan retur yang belum selesai per supplier.

**Selesai bila:** stok rusak bisa dijual (staf), dibuang (admin), dan dikembalikan ke supplier. Setiap jalan tercatat dengan pelaku dan alasan. Stok jual tidak berubah oleh ketiganya.

---

## 5. M3: Hutang

### 5.1 Jatuh tempo
- Kolom baru `sales.jatuh_tempo DATE NULL`, diisi saat nota berhutang dilunasi (status lunas).
- Default H+7 untuk semua pembeli dari pengaturan `hutang_tempo_hari` (nilai 7). Kasir boleh mengubah tanggalnya.
- Nota lama yang berhutang diisi `DATE(created_at) + 7 hari` lewat migrasi sekali jalan.
- Daftar hutang menampilkan jatuh tempo per nota dan menandai yang lewat tempo dengan warna merah.
- Saat nama pembeli diketik di kasir, peringatan hutang lama menyebut berapa yang sudah lewat tempo.
- Cek sore menampilkan jumlah nota yang lewat tempo hari ini.

### 5.2 Nama mirip
- Saat kasir menyimpan pembeli baru, sistem mencari nama yang mirip di antara pembeli aktif.
- Perbandingan: huruf kecil, spasi ganda dihapus, jarak edit paling banyak 2 huruf, dan "nama yang satu memuat nama yang lain".
- Bila ada yang mirip, muncul pilihan: pakai pembeli yang sudah ada, atau tetap buat baru.
- Membuat baru tetap boleh, karena nama spesifik seperti "Andi Baki anak pak lurah" memang sengaja berbeda.

### 5.3 Teks pengingat WhatsApp
- Pengaturan baru `wa_pengingat`, diubah admin di panel (dengan izin admin).
- Teks awal mengikuti template di spesifikasi tahap 1 (`template_pengingat_wa`).
- Penanda yang bisa dipakai: `{nama}`, `{total}`, `{rincian}` (daftar nomor nota, tanggal, dan sisa per nota), `{toko}`, `{lewat_tempo}`.
- Pembeli tanpa nomor telepon tidak bisa dikirimi pengingat.

**Selesai bila:** setiap nota berhutang punya jatuh tempo. Daftar hutang menandai yang lewat tempo. Nama mirip memunculkan pilihan. Teks WhatsApp mengikuti pengaturan.

---

## 6. M4: Laporan lanjutan, riwayat harga beli, dan PDF

Halaman Laporan tetap satu, dengan rentang tanggal yang sudah ada. Laporan dapat dibuka dari HP maupun komputer toko (tampilan responsif).

| Bagian | Isi | Sumber |
|---|---|---|
| Per kategori | Omset, laba kotor, dan persentase per kategori produk | `sale_items` lunas dikurangi retur, digabung dengan `products.category` |
| Tren | Omset dan jumlah nota per hari, per minggu, atau per bulan, dalam grafik batang | `sales` lunas |
| Pergerakan stok | Untuk satu produk: masuk rak, terjual, retur, koreksi, cek sore, rusak, dengan saldo berjalan | `purchase_shelf`, `sale_items`, `sale_return_items`, `stock_adjustments` |
| Laris dan lambat | 20 produk terlaris menurut jumlah dan menurut omset. Produk aktif yang tidak terjual N hari (N diatur, default 30) beserta nilai stoknya. | `sale_items`, `variants` |
| Hutang lewat tempo | Per pembeli dan per nota, dengan umur hutang | `sales.jatuh_tempo` |
| Stok rusak | Jumlah dan nilai per produk. Jumlah yang dibuang, dijual, dan dikembalikan. | M2 |
| **Riwayat harga beli** | **Tabel per produk: harga beli per tanggal barang masuk. Grafik garis harga beli per waktu untuk produk yang dipilih.** | `barang_masuk_item` (harga per barang masuk), dihubungkan ke `barang_masuk` untuk tanggal |

Grafik dibuat dengan SVG langsung di halaman, tanpa library baru.

**Riwayat harga beli:** harga beli per warna dan per tanggal diambil dari `barang_masuk_item`. Di tabel per produk, harga beli ditampilkan per tanggal terima. Harga per satuan dasar dihitung dari `harga_beli_satuan / isi`.

### 6.1 Ekspor PDF
- Laporan harian mendapat tata letak cetak khusus (CSS `@media print`, ukuran A4).
- Tombol "Simpan PDF" membuka dialog cetak dengan pilihan "Simpan sebagai PDF". Ini cukup untuk tahap 2.
- Tidak ada unduhan PDF langsung dari server di tahap 2.

**Selesai bila:** semua bagian di tabel tampil untuk rentang tanggal mana pun. Laporan harian bisa disimpan sebagai PDF yang rapi di satu sampai dua halaman A4. Laporan bisa dibuka dengan layar HP.

---

## 7. M5: Diskon rupiah dan input stok awal

### 7.1 Diskon rupiah
- Kasir bisa memberi diskon per baris dalam rupiah.
- Kolom baru `sale_items.diskon_rp BIGINT NOT NULL DEFAULT 0` dan `sale_items.diskon_oleh INT NULL`.
- Diskon ditampilkan dalam rupiah di layar dan di nota. Tidak ada persen.
- Diskon otomatis di `lib/discount.js` tetap dalam persen dan dihitung seperti sebelumnya. Hasilnya dicatat sebagai rupiah.
- Laporan menampilkan total diskon per kasir.

### 7.2 Input stok awal bertahap
- Halaman baru "Stok awal" di menu Stok.
- Staf memilih kategori, lalu mendapat tabel semua produk dan warna di kategori itu. Kolom isian jumlah dalam satuan jual yang dipilih (mis. dosin), dikonversi ke satuan dasar.
- Setiap baris disimpan sendiri begitu diisi, jadi pekerjaan bisa berhenti dan dilanjutkan besok.
- Baris yang sudah diisi diberi tanda dan tanggal. Kolom baru `variants.stok_awal_pada DATETIME NULL`.
- Perubahan dicatat di `stock_adjustments` dengan catatan "stok awal".
- Di atas tabel tampil kemajuan per kategori, mis. "Benang: 312 dari 540 warna sudah dihitung".

**Selesai bila:** diskon rupiah tersimpan dan tampil di layar dan nota. Satu kategori penuh bisa diisi bertahap dalam beberapa hari tanpa kehilangan isian.

---

## 8. M6: PO ke supplier, lokasi rak, dan opname per warna

### 8.1 PO ke supplier
- Pesanan ke supplier dicatat sebelum barang datang, dengan status `draft`, `dikirim`, `diterima sebagian`, `diterima`, atau `batal`.
- Pembelian tetap lunas. Tidak ada hutang supplier.
- Saat barang masuk diterima, rujukan ke PO diisi. Stok bertambah lewat alur barang masuk biasa.
- PO tidak menyentuh stok sebelum barang diterima.
- PO konsumen (backorder dengan DP) tidak masuk tahap 2.

### 8.2 Lokasi rak
- Lokasi hanya untuk mencari barang. Stok tetap satu angka per warna (stok toko dan gudang digabung).
- Struktur lokasi: ruangan, lemari, dan rak. Setiap varian bisa punya satu lokasi utama.
- Kolom baru `variants.lokasi_rak VARCHAR(50) NULL`, dan tabel `lokasi` (`id`, `ruangan`, `lemari`, `rak`, `aktif`) bila perlu daftar lokasi yang seragam.
- Layar pencarian menampilkan lokasi rak untuk setiap varian.

### 8.3 Stok opname per warna
- Opname dilakukan per warna: staf memilih satu warna, lalu mengetik jumlah fisik di semua lokasi tempat warna itu disimpan.
- Sistem menghitung selisih terhadap `stok` dan menampilkan selisih sebelum disimpan.
- Selisih disimpan lewat koreksi stok dengan alasan wajib (`stock_adjustments`, jenis "opname").
- Hasil opname tercatat per tanggal dan siapa yang menghitung.
- Stok tidak boleh minus. Jumlah fisik yang lebih kecil dari penjualan yang belum tercatat tetap dicatat sebagai koreksi.

**Selesai bila:** PO bisa dibuat dan diterima tanpa mengubah stok sebelum diterima. Varian bisa dicari dengan lokasinya. Opname per warna menghasilkan selisih yang tercatat dengan alasan.

---

## 9. Model data tambahan

| Milestone | Perubahan |
|---|---|
| M0 | Tidak ada tabel baru. Skema lama diarsipkan. |
| M1 | `users.role` menerima `admin` dan `staff`. Tabel `catatan_perubahan`. Tabel `izin_pengguna` (`user_id`, `izin`, `diberi_oleh`, `diberi_pada`). |
| M2 | `sale_items.dari_rusak`. Tabel `retur_supplier` dan `retur_supplier_item`. `dompet_mutasi.jenis` menerima `retur_supplier`. |
| M3 | `sales.jatuh_tempo`. Pengaturan `hutang_tempo_hari` (7) dan `wa_pengingat`. |
| M4 | Pengaturan `hari_lambat_laku` (30). Tidak ada tabel baru. |
| M5 | `sale_items.diskon_rp` (BIGINT), `sale_items.diskon_oleh`, `variants.stok_awal_pada`. |
| M6 | Tabel `purchase_orders` dan `purchase_order_items`. `variants.lokasi_rak`. Tabel `lokasi` (opsional). Tabel `opname` dan `opname_item`. |

Semua kolom uang memakai `BIGINT`. Jumlah stok memakai `DOUBLE` dalam satuan dasar.

---

## 10. Rencana kerja dan pengujian

- Urutan: M0, M1, M2, M3, M4, M5, M6.
- Setiap milestone menambah skenarionya ke `npm run uji` sebelum dianggap selesai, lalu diuji manual di toko satu hari penuh.
- Setiap milestone di-commit terpisah, atau per bagian bila milestone besar.

---

## 11. Belum diputuskan

- [ ] **Konfirmasi peran staf untuk laporan penjualan biasa:** saat ini staf tidak boleh melihat laporan laba. Apakah staf boleh melihat laporan penjualan tanpa laba?
- [ ] **Opname: apakah opname bisa dibagi per ruangan** jika satu warna tersebar di banyak lokasi?
- [ ] **Riwayat harga beli:** apakah harga per satuan dasar ditampilkan juga, atau hanya harga per satuan beli?

---

## 12. Di luar tahap 2

- PPh dan PPN, laporan pajak (PBK), persiapan E-Faktur.
- Persiapan redenominasi rupiah.
- Pindah dari komputer toko ke VPS, termasuk backup di luar toko.
- Toko online dan sinkronisasi stok (fase 3).
- PO konsumen dan backorder (DP minimal Rp 1.000).
- Pemisahan stok toko dan gudang (stok tetap digabung).
- FIFO warna (kasir tetap memilih warna).
- Foto uang dan kembalian otomatis.
