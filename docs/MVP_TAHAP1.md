# MVP Tahap 1: Tokoku (sudut pandang tim kerja)

> Dokumen ini ditulis dari sisi orang-orang yang bekerja di toko setiap hari: pemilik, admin, dan staf penjualan. Isinya menjelaskan apa yang dibutuhkan tim, apa yang sudah ada di aplikasi, dan apa yang belum.
>
> Ruang lingkup teknis dan aturan bisnis lengkap ada di `RUANG_LINGKUP_MVP_TAHAP1.md` (folder induk) dan rancangan tabel di `db/schema_fase1.sql`. Dokumen ini adalah versi yang dibaca tim.
>
> Status: draft untuk dibahas bersama.

---

## 1. Masalah yang ingin diselesaikan

Sekarang toko masih memakai nota tulisan tangan, buku hutang, dan cek sore yang tidak rutin. Akibatnya:

- Hutang pembeli sering terlupa. Tidak jelas siapa berhutang berapa.
- Stok tidak terlihat. Kadang menumpuk, kadang habis tanpa disadari.
- Penjualan harian sulit direkap.
- Barang rusak atau hilang tidak tercatat.

Tokoku dibuat supaya setiap penjualan, stok, dan hutang tercatat di satu tempat, dan tim bisa melihat kondisi toko kapan saja.

## 2. Siapa yang memakai

| Orang | Peran di aplikasi | Yang sering dilakukan |
|---|---|---|
| Ibu (pemilik) | `owner` | Melihat laporan, mengatur harga, mengelola akun, backup |
| Admin (anak) | belum ada peran sendiri, saat ini memakai `owner` | Mengurus produk, stok, pembelian, dan hutang |
| Staf (anak mantu) | `staff` | Melayani kasir, mencatat retur, memasukkan barang ke rak |

Setiap orang punya akun sendiri. Akun tidak dihapus, hanya dinonaktifkan, supaya riwayat tetap utuh.

**Catatan untuk tim:** aturan bahwa hanya ibu dan admin yang boleh mengubah harga jual belum terlihat diterapkan. Ini perlu dicek lagi.

## 3. Alur kerja harian

### Pagi
1. Login, aplikasi mencatat shift.
2. Cek stok warna yang kuning atau merah di halaman stok.

### Saat melayani pembeli
1. Pilih produk, satuan, dan jumlah di kasir.
2. Warna boleh dikosongkan. Warna diisi nanti saat cek sore.
3. Jika pembeli berhutang, isi nama yang spesifik. Batas hutang baru Rp 200.000 per nota (untuk pembeli yang belum punya alamat).
4. Bayar dengan cash, e-wallet, transfer, hutang, atau kombinasinya.
5. Cetak nota.

### Saat barang datang dari supplier
1. Catat pembelian (supplier, produk, satuan, harga, jumlah).
2. Masukkan barang ke rak per warna. Stok baru bertambah di tahap ini.

### Sore
1. Cek sore: isi warna untuk barang yang terjual tanpa warna.
2. Koreksi stok jika ada selisih, dengan catatan.
3. Lihat daftar hutang pembeli dan kirim pengingat lewat WhatsApp bila perlu.
4. Lihat laporan harian.

## 4. Kebutuhan tim dan status saat ini

Status: **Ada** = sudah berjalan, **Sebagian** = ada tapi belum sesuai rencana, **Belum** = belum dibuat.

### 4.1 Produk dan stok

| Kebutuhan | Status | Catatan |
|---|---|---|
| Produk dengan varian warna, stok per warna | Ada | |
| Harga jual per satuan (biji, dosin, gross, meter, paket) | Ada | |
| Peringatan stok tiga level (hijau, kuning, merah) | Ada | Batas khusus untuk warna laris belum ada |
| Stok tidak boleh minus | Sebagian | Dijaga di cek sore, perlu diuji untuk semua jalur |
| Koreksi stok dengan alasan wajib | Sebagian | Alasan masih opsional |
| Riwayat perubahan stok | Sebagian | Tercatat untuk koreksi dan cek sore, belum untuk semua jenis perubahan |
| Input stok awal bertahap per kategori | Belum | |

### 4.2 Penjualan (nota)

| Kebutuhan | Status | Catatan |
|---|---|---|
| Kasir dengan satuan ganda dan diskon | Ada | |
| Nota bisa dicetak, tanpa warna | Ada | |
| Warna boleh kosong, diisi di cek sore | Ada | |
| Split payment (campuran cash, e-wallet, transfer, hutang) | Ada | |
| Bayar hutang lama dan belanja baru sekaligus | Ada | |
| Nomor nota otomatis `NT-YYYYMMDD-####` | Belum | |
| Status nota draft, lunas, batal | Belum | Nota langsung tersimpan dan stok langsung berkurang |
| Pembayaran e-wallet dan transfer menunggu konfirmasi, peringatan 60 menit | Belum | |
| Pembayaran QRIS, GoPay, ShopeePay dipisah | Belum | Saat ini hanya satu kolom e-wallet |
| Pembulatan total manual oleh staf | Belum | Saat ini pembulatan dilakukan otomatis per baris |
| Harga disalin ke nota saat transaksi | Ada | |
| Diskon dengan jenis, nilai, dan pemberi | Sebagian | Hanya persentase |

### 4.3 Pembeli dan hutang

| Kebutuhan | Status | Catatan |
|---|---|---|
| Nama pembeli wajib untuk hutang | Ada | |
| Peringatan nama mirip untuk mencegah data ganda | Sebagian | Ada saran nama, tapi belum mencari nama mirip secara menyeluruh |
| Tiga tingkat pembeli (V, A, B) | Belum | Batas Rp 200.000 ada, belum dibedakan per tingkat |
| Batas Rp 100.000 hutang lama harus dilunasi dulu | Belum | |
| Penanda "dikenal" oleh staf | Belum | |
| Hutang per nota, pelunasan urut nota tertua | Belum | Saat ini hanya satu total per pembeli |
| Daftar pembeli yang berhutang | Ada | Belum menampilkan nomor nota |
| Pengingat hutang lewat WhatsApp | Ada | Teks pesan belum bisa diatur |
| Saldo titipan | Belum | |

### 4.4 Retur

| Kebutuhan | Status | Catatan |
|---|---|---|
| Retur mengacu ke nota asal | Ada | |
| Jumlah retur tidak boleh melebihi yang dibeli | Ada | |
| Nilai retur dibagi ke hutang dan uang kembali | Ada | |
| Batas 7 hari dan aturan pengecualian dengan catatan wajib | Belum | |
| Barang cacat masuk stok rusak | Belum | Saat ini hanya kotak "kembalikan ke stok" |
| Tukar barang sebagai nota baru | Belum | |
| Nilai retur dibagi ke saldo titipan | Belum | |

### 4.5 Barang masuk (pembelian dari supplier)

| Kebutuhan | Status | Catatan |
|---|---|---|
| Catat supplier dan tanggal | Ada | |
| Masukkan ke rak per warna, stok bertambah | Ada | |
| Status dalam perjalanan, diterima, hilang | Belum | Pembelian dianggap langsung lunas |
| Nomor nota supplier dan cara kirim | Belum | Hanya catatan bebas |
| Harga beli terakhir diperbarui otomatis | Belum | |
| Peringatan saat harga beli berubah | Belum | |
| Pembayaran cash ke supplier tercatat sebagai uang keluar | Belum | Belum ada pencatatan dompet |

### 4.6 Stok rusak

| Kebutuhan | Status | Catatan |
|---|---|---|
| Stok rusak terpisah dari stok jual | Belum | |
| Jual stok rusak dengan diskon atau hapus | Belum | |
| Barang cacat dikembalikan ke supplier | Belum | |

### 4.7 Uang dan cek sore

| Kebutuhan | Status | Catatan |
|---|---|---|
| Tiga dompet: laci, receh, kulaan | Belum | |
| Pencatatan uang keluar (jamu, GoSend, bayar supplier) | Belum | |
| Cek sore: isi warna | Ada | |
| Cek sore: nota draft, lembaran uang, e-wallet dicocokkan, daftar hutang | Belum | |
| Hitung laci seminggu sekali, dengan selisih | Belum | |

### 4.8 Laporan

| Kebutuhan | Status | Catatan |
|---|---|---|
| Laporan harian penjualan | Ada | Termasuk omset, metode bayar, terlaris, per kasir |
| Laporan pembelian | Sebagian | |
| Rincian per produk dan per warna | Sebagian | |
| Ekspor | Sebagian | Ada CSV dan cetak lewat browser, belum PDF langsung |
| Laporan pembulatan dan selisih laci | Belum | |

### 4.9 Akun, shift, dan keamanan

| Kebutuhan | Status | Catatan |
|---|---|---|
| Login per orang, password di-hash | Ada | |
| Shift mulai dan selesai tercatat | Ada | |
| Logout otomatis karena diam | Ada | Tidak ada di rencana awal, tambahan dari tim |
| Backup database | Ada | Tidak ada di rencana awal, tambahan dari tim |
| Peran admin terpisah dari ibu | Belum | Saat ini hanya `owner` dan `staff` |
| Hanya ibu dan admin boleh ubah harga jual | Perlu dicek | |
| Catatan siapa mengubah apa | Sebagian | Tercatat untuk transaksi, belum untuk semua perubahan |

## 5. Yang sengaja tidak masuk tahap 1

- Backorder atau PO dari pembeli (DP minimal Rp 1.000).
- Hitung kembalian otomatis dan foto uang.
- Pemisahan toko dan gudang, opname formal, lokasi rak.
- FIFO warna. Saat ini kasir memilih warna.
- Manajemen supplier, PPh/PPN (fase 2).
- Toko online dan sinkronisasi stok (fase 3).
- Pembayaran lewat payment gateway (tidak direncanakan).

## 6. Yang perlu diputuskan tim

- [ ] Peran admin: apakah dibuat sebagai peran tersendiri, atau tetap sama dengan ibu?
- [ ] Apakah staf benar-benar tidak boleh mengubah harga jual?
- [ ] Nota per transaksi: perlu status draft dan batal, atau cukup langsung tersimpan?
- [ ] Pembulatan total: dilakukan manual oleh staf, atau cukup otomatis?
- [ ] Pembeli tingkat V, A, B: perlu dibedakan di aplikasi, atau cukup satu aturan batas?
- [ ] Teks pengingat WhatsApp: siapa yang menulis dan kapan bisa diubah?
- [ ] Harga diskon jenis tetap: ditulis manual lalu dikonversi ke persen?
- [ ] Input data awal produk (benang lebih dari 500 item, kain, dan warnanya): sekaligus atau bertahap?
- [ ] Laporan harian: perlu dibuka dari HP, atau cukup dari komputer toko?

## 7. Kriteria selesai tahap 1 (versi tim)

Tahap 1 dianggap selesai jika tim bisa:

1. Mencatat semua penjualan harian, termasuk pembayaran campuran dan hutang, tanpa buku tulis.
2. Menjalankan cek sore setiap hari dari layar aplikasi.
3. Melihat stok per warna yang akurat, setelah dicocokkan dengan hitungan fisik sekali.
4. Melihat hutang per pembeli dan mengirim pengingat WhatsApp.
5. Mencatat barang masuk dari supplier dan melihat stok bertambah otomatis.
6. Mengekspor laporan harian ke PDF.
7. Login dengan akun masing-masing (ibu, admin, staf).
8. Menjalankan uji lunas, batal, retur, dan barang masuk tanpa data yang rusak.

Dari daftar ini, poin 1, 2 (sebagian), 4, 5 (sebagian), dan 7 sudah bisa dipakai. Poin 3, 6, dan 8 belum lengkap.

---

*Dokumen ini ditulis dari kode yang ada per tanggal 28 Oktober 2026. Status dapat berubah seiring pengembangan.*
