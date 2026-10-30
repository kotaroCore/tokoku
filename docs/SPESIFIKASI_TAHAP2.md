# Tokoku — Spesifikasi Tahap 2

30 Oktober 2026 · @kotaroCore

## Ringkasan dan lingkup

Tahap 2 menyelesaikan pekerjaan yang tersisa dari tahap 1, lalu menambah hak akses, tindak lanjut stok rusak, hutang dengan jatuh tempo, dan laporan lanjutan. Bahannya ada di [TAHAP2.md](TAHAP2.md), yang merangkum hasil pencocokan kode dengan `TOKO_PROJECT_PLAN_FINAL.md` dan [MVP_TAHAP1.md](MVP_TAHAP1.md). Stack dan aturan tahap 1 tetap berlaku; dokumen ini hanya mencatat tambahannya.

| Milestone | Isi | Bisa mulai? |
| --- | --- | --- |
| M0 | Penyamaan dokumen, satu skema, uji otomatis | Ya |
| M1 | Peran admin, hak ubah harga, catatan perubahan | Setelah pemilik menjawab soal peran dan harga |
| M2 | Tindak lanjut stok rusak | Ya |
| M3 | Hutang: jatuh tempo, nama mirip, teks WhatsApp | Ya, dengan usulan default H+7 |
| M4 | Laporan lanjutan dan ekspor PDF | Ya; laporan lewat tempo setelah M3 |
| M5 | Diskon rupiah, input stok awal bertahap | Ya |
| — | Lingkup fase 2 rencana awal (PO, pajak, redenominasi, VPS, gudang) | Tidak, menunggu urutan dari pemilik |
| Nanti | Toko online dan sinkronisasi stok | Fase 3 |

**Aturan yang tetap berlaku:**

- Data produk, pengguna, supplier, dan pembeli tidak dihapus, hanya dinonaktifkan.
- Kasir tidak menampilkan warna; warna diambil otomatis lalu dicocokkan di cek sore.
- Pembelian ke supplier selalu lunas, jadi tidak ada hutang supplier. Harga beli diatur manual.
- Stok jual dan stok rusak tidak boleh minus. Hutang dan saldo titipan tidak boleh minus.
- Skema dibuat dan diubah lewat `SCHEMA` dan `MIGRATIONS` di `lib/db.js`. Setiap kolom baru ditambah sebagai migrasi, bukan dengan mengubah `CREATE TABLE`.
- Uang disimpan sebagai `DECIMAL(14,2)`, jumlah stok dalam satuan dasar sebagai `DOUBLE`.

**Hutang tahap 1** harus selesai sebelum tahap 1 dinyatakan selesai (kriteria di MVP_TAHAP1 bagian 7):

- [ ] **Ekspor laporan harian ke PDF** (kriteria 6). Dikerjakan di M4.
- [ ] **Uji lunas, batal, retur, dan barang masuk tanpa data rusak** (kriteria 8). Dikerjakan di M0.
- [ ] **Stok per warna dicocokkan dengan hitungan fisik sekali** (kriteria 3). Pekerjaan di toko, dibantu layar stok awal di M5.

## M0 — Penyamaan dokumen dan kebersihan teknis

Kode adalah acuan utama. M0 menyamakan dokumen dengan kode, bukan sebaliknya.

### Dokumen

Status di MVP_TAHAP1.md diperbarui. Butir berikut sudah berjalan tetapi masih tertulis "Belum": nomor nota `NT-YYYYMMDD-####`, status draf/lunas/batal, konfirmasi e-wallet dan transfer, pembulatan manual, tier pembeli, batas Rp 100.000 hutang lama, penanda dikenal, pelunasan urut nota tertua, saldo titipan, batas retur 7 hari, stok rusak terpisah, tukar barang, status kiriman barang masuk, nomor nota supplier, harga beli terakhir dan peringatannya, tiga dompet, uang keluar, hitung laci, dan cek sore lengkap. Bagian 6 (yang perlu diputuskan) dipindah ke pertanyaan terbuka dokumen ini.

### Satu skema

Aplikasi memakai tabel di `lib/db.js` (`sales`, `sale_items`, `variants`, dst.) lewat `lib/sales.js`. `lib/nota.js` dan `db/schema_fase1.sql` (tabel `nota`, `hutang`, `mutasi_stok`, dst.) tidak dipakai di mana pun selain `scripts/uji_nota.mjs`. Keduanya dipindah ke `docs/arsip/` beserta catatan singkat bahwa itu rancangan awal. `db/migrasi_dari_prototipe.sql` ikut diperiksa: bila juga hanya menulis ke skema lama, ikut diarsipkan.

### Uji otomatis

`scripts/uji_nota.mjs` diganti `scripts/uji.mjs` yang memakai database uji terpisah (`DB_NAME=tokoku_uji`, dibuat dan dikosongkan setiap kali jalan) dan memanggil fungsi di `lib/` langsung. Tidak perlu library uji; cukup `node:assert` dan `node:test`. Ditambah sebagai `npm run uji`.

| Skenario | Yang dicek |
| --- | --- |
| Nota draf lalu lunas | Stok berkurang hanya saat lunas; nomor nota berurutan per hari |
| Nota dibatalkan | Stok, hutang, saldo, dan dompet kembali seperti semula |
| Dua kasir menyimpan bersamaan | Nomor nota tidak kembar |
| Pembayaran campuran | Cash, e-wallet, transfer, saldo, tukar, dan hutang berjumlah sama dengan tagihan |
| Hutang tier A dan B | Batas Rp 200.000 / Rp 500.000; hutang lama di atas Rp 100.000 menolak hutang baru tier A |
| Bayar hutang lama | Dibagi ke nota tertua dulu |
| Retur sebagian | Tidak melebihi yang dibeli; potong hutang dulu; barang rusak masuk `stok_rusak` |
| Tukar barang | Nilai retur jadi pembayaran nota baru |
| Barang masuk dicicil ke rak | Stok bertambah per warna sesuai yang dirak; status hilang tidak menambah stok |
| Stok tidak minus | Penjualan, koreksi, dan cek sore menolak stok di bawah nol |

**Selesai bila:** MVP_TAHAP1.md sesuai kode, hanya satu skema yang tersisa di luar arsip, dan `npm run uji` lolos untuk semua skenario di atas.

## M1 — Hak akses dan catatan perubahan

Menunggu jawaban pemilik untuk dua pertanyaan pertama di bagian pertanyaan terbuka. Isi di bawah adalah usulan.

### Peran

Kolom `users.role` menerima `owner`, `admin`, dan `staff`. Pengguna tetap tidak dihapus, hanya dinonaktifkan. Minimal satu owner aktif harus selalu ada (aturan yang sudah ada).

| Kegiatan | Owner | Admin | Staf |
| --- | --- | --- | --- |
| Kasir, riwayat, retur, tukar, hutang, saldo | Ya | Ya | Ya |
| Cek stok, cek sore, barang masuk ke rak | Ya | Ya | Ya |
| Tambah produk, warna, satuan | Ya | Ya | Ya |
| Ubah harga jual dan harga satuan | Ya | Ya | Tidak |
| Ubah harga beli (modal) | Ya | Ya | Tidak |
| Koreksi stok | Ya | Ya | Ya, alasan wajib |
| Tandai pembeli dikenal | Ya | Ya | Usulan: ya, tercatat |
| Laporan dan laba | Ya | Ya | Usulan: tidak |
| Panel (pengguna, pengaturan, backup) | Ya | Tidak | Tidak |

Pemeriksaan dilakukan di API, bukan hanya dengan menyembunyikan tombol. `lib/auth.js` mendapat `requireRoleApi(...roles)`; `requireOwnerApi` tetap ada sebagai singkatannya. Di form produk, kolom harga tampil terkunci untuk staf.

### Catatan perubahan

Tabel baru `catatan_perubahan`:

| Kolom | Isi |
| --- | --- |
| `id` | |
| `user_id` | Siapa |
| `dibuat_pada` | Kapan |
| `objek` | `produk`, `satuan`, `warna`, `stok`, `pembeli`, `supplier`, `pengguna`, `pengaturan` |
| `objek_id` | Baris yang diubah |
| `aksi` | `tambah`, `ubah`, `nonaktif`, `aktif` |
| `lama`, `baru` | JSON berisi kolom yang berubah saja |

Ditulis di transaksi yang sama dengan perubahannya. Transaksi penjualan, retur, dan barang masuk tidak ikut dicatat di sini karena sudah punya jejak sendiri. Panel owner mendapat halaman "Catatan perubahan" dengan saring per objek, per pengguna, dan rentang tanggal.

**Selesai bila:** staf yang memanggil API ubah harga mendapat 403; setiap perubahan harga, koreksi stok, dan perubahan pengguna muncul di halaman catatan dengan nilai lama dan baru.

## M2 — Tindak lanjut stok rusak

Kolom `variants.stok_rusak` sudah terisi dari retur barang cacat, tetapi belum bisa dikeluarkan. M2 menambah tiga jalan keluar. Semuanya mengurangi `stok_rusak`, tidak menyentuh stok jual, dan tercatat di `stock_adjustments` dengan `kolom = 'rusak'`.

### Jual barang rusak

Di kasir, produk yang punya stok rusak mendapat pilihan "jual barang rusak". Baris nota diberi tanda `sale_items.dari_rusak = 1`, harga boleh diturunkan bebas, dan stok yang berkurang saat lunas adalah `stok_rusak`. Karena kasir tidak memilih warna, warna diambil dari stok rusak terbanyak, sama seperti aturan stok jual. Nota tetap tidak menampilkan warna, tetapi baris ini ditandai "(rusak)" di nota agar pembeli tahu.

### Buang

Dari halaman Cek stok, tombol "Buang" pada baris yang punya stok rusak. Jumlah dan alasan wajib. Nilai yang dibuang (jumlah × harga beli) tampil di laporan sebagai kerugian.

### Kembalikan ke supplier

Tabel baru `retur_supplier` (`id`, `supplier_id`, `user_id`, `status`, `nilai`, `catatan`, `dibuat_pada`, `selesai_pada`) dan `retur_supplier_item` (`retur_supplier_id`, `variant_id`, `qty`, `harga_beli`).

- Status `dikirim`: stok rusak langsung berkurang.
- Status `diganti`: supplier mengirim barang pengganti; staf memasukkannya ke rak lewat alur barang masuk biasa dengan total Rp 0 dan rujukan ke retur ini.
- Status `diuangkan`: uang masuk ke dompet kulakan sebagai `dompet_mutasi` jenis `retur_supplier`.
- Status `ditolak`: supplier menolak; barang kembali ke stok rusak atau dibuang.

Halaman Supplier menampilkan retur yang belum selesai per supplier.

**Selesai bila:** stok rusak bisa dijual, dibuang, dan dikembalikan ke supplier; setiap jalan tercatat dengan pelaku dan alasan; stok jual tidak berubah oleh ketiganya.

## M3 — Hutang

### Jatuh tempo

Kolom baru `sales.jatuh_tempo DATE NULL`, diisi saat nota berhutang dilunasi (status lunas). Default dari pengaturan `hutang_tempo_hari` (usulan 7); kasir boleh mengubah tanggalnya. Nota lama yang berhutang diisi `DATE(created_at) + 7 hari` lewat migrasi sekali jalan.

- Daftar hutang menampilkan jatuh tempo per nota dan menandai yang lewat tempo dengan warna merah.
- Saat nama pembeli diketik di kasir, peringatan hutang lama menyebut juga berapa yang sudah lewat tempo.
- Cek sore menampilkan jumlah nota yang lewat tempo hari ini.

### Nama mirip

Saat kasir menyimpan pembeli baru, sistem mencari nama yang mirip di antara pembeli aktif: huruf kecil, spasi ganda dihapus, lalu dibandingkan dengan jarak edit (paling banyak 2 huruf berbeda) dan dengan "nama yang satu memuat nama yang lain". Bila ada, muncul pilihan: pakai pembeli yang sudah ada, atau tetap buat baru. Membuat baru tidak dilarang, karena nama spesifik seperti "Andi Baki anak pak lurah" memang sengaja berbeda.

### Teks pengingat WhatsApp

Pengaturan baru `wa_pengingat`, diubah owner di panel. Penanda yang bisa dipakai: `{nama}`, `{total}`, `{rincian}` (daftar nomor nota, tanggal, dan sisa per nota), `{toko}`, `{lewat_tempo}`. Teks default sama dengan yang dipakai sekarang. Pembeli tanpa nomor telepon tetap tidak bisa dikirimi pengingat.

**Selesai bila:** setiap nota berhutang punya jatuh tempo, daftar hutang menandai yang lewat tempo, nama mirip memunculkan pilihan, dan teks WhatsApp mengikuti pengaturan.

## M4 — Laporan lanjutan dan ekspor PDF

Halaman Laporan tetap satu, dengan rentang tanggal yang sudah ada. Bagian baru:

| Bagian | Isi | Sumber |
| --- | --- | --- |
| Per kategori | Omset, laba kotor, dan persentase per kategori produk | `sale_items` lunas dikurangi retur, gabung `products.category` |
| Tren | Omset dan jumlah nota per hari, per minggu, atau per bulan, dalam grafik batang | `sales` lunas |
| Pergerakan stok | Untuk satu produk: masuk rak, terjual, retur, koreksi, cek sore, rusak, dengan saldo berjalan | `purchase_shelf`, `sale_items`, `sale_return_items`, `stock_adjustments` |
| Laris dan lambat | 20 produk terlaris menurut jumlah dan menurut omset; produk aktif yang tidak terjual N hari (N diatur, default 30) beserta nilai stoknya | `sale_items`, `variants` |
| Hutang lewat tempo | Per pembeli dan per nota, dengan umur hutang | `sales.jatuh_tempo` (setelah M3) |
| Stok rusak | Jumlah dan nilai per produk, jumlah yang dibuang, dijual, dan dikembalikan | M2 |

Grafik dibuat dengan SVG langsung di halaman, tanpa library baru.

### Ekspor PDF

Usulan: laporan harian mendapat tata letak cetak khusus (CSS `@media print`, ukuran A4) dan tombol "Unduh PDF" yang membuka dialog cetak dengan pilihan "Simpan sebagai PDF". Cara ini tanpa dependensi baru dan bisa dipakai dari komputer toko maupun HP. Bila pemilik ingin file PDF langsung terunduh tanpa dialog cetak, dipakai library pembuat PDF di server; ini keputusan terbuka.

**Selesai bila:** semua bagian di tabel tampil untuk rentang tanggal mana pun, dan laporan harian bisa disimpan sebagai PDF yang rapi di satu sampai dua halaman A4.

## M5 — Diskon rupiah dan input stok awal

### Diskon rupiah

Kasir bisa memberi diskon per baris dalam persen (seperti sekarang) atau dalam rupiah. Kolom baru `sale_items.diskon_rp DECIMAL(14,2) NOT NULL DEFAULT 0` dan `sale_items.diskon_oleh INT NULL`. Bila keduanya diisi, persen dihitung dulu lalu rupiah. Diskon otomatis di `lib/discount.js` tetap dalam persen. Laporan menampilkan total diskon per kasir.

### Input stok awal bertahap

Halaman baru "Stok awal" di menu Stok. Staf memilih kategori, lalu mendapat daftar semua produk dan warna di kategori itu dalam satu tabel dengan kolom isian jumlah dalam satuan jual yang dipilih (mis. dosin), dikonversi ke satuan dasar.

- Setiap baris disimpan sendiri begitu diisi, jadi pekerjaan bisa berhenti dan dilanjutkan besok.
- Baris yang sudah diisi diberi tanda dan tanggal. Kolom baru `variants.stok_awal_pada DATETIME NULL`.
- Perubahan dicatat di `stock_adjustments` dengan catatan "stok awal".
- Di atas tabel tampil kemajuan per kategori, mis. "Benang: 312 dari 540 warna sudah dihitung".

**Selesai bila:** diskon rupiah tersimpan dan terlihat di laporan; satu kategori penuh bisa diisi bertahap dalam beberapa hari tanpa kehilangan isian.

## Lingkup fase 2 rencana awal

Butir ini ada di rencana sejak awal tetapi belum diurutkan pemilik. Masing-masing butuh spesifikasi sendiri sebelum dikerjakan; dokumen ini tidak merinci isinya.

- PO ke supplier dan pelacakan pembelian, tanpa hutang supplier.
- PPh dan PPN, laporan pajak (PBK), persiapan E-Faktur. Perlu data usaha dan aturan pajak yang berlaku untuk toko.
- Persiapan redenominasi rupiah.
- Pindah dari komputer toko ke VPS, termasuk backup di luar toko.
- Modul gudang: lokasi rak dan opname formal.

## Model data tambahan

| Milestone | Perubahan |
| --- | --- |
| M1 | `users.role` menerima `admin`; tabel `catatan_perubahan` |
| M2 | `sale_items.dari_rusak`; tabel `retur_supplier` dan `retur_supplier_item`; `dompet_mutasi.jenis` menerima `retur_supplier` |
| M3 | `sales.jatuh_tempo`; pengaturan `hutang_tempo_hari` dan `wa_pengingat` |
| M4 | Pengaturan `hari_lambat_laku`; tidak ada tabel baru |
| M5 | `sale_items.diskon_rp`, `sale_items.diskon_oleh`, `variants.stok_awal_pada` |

## Rencana kerja dan pengujian

Urutan usulan: M0 dulu, karena uji otomatisnya menjaga semua milestone setelahnya. Lalu M2 dan M3 (tidak menunggu keputusan), M1 begitu pemilik menjawab, M4, dan M5. M5 bisa dimajukan bila input data awal produk ingin segera dimulai.

Setiap milestone menambah skenarionya ke `npm run uji` sebelum dianggap selesai, lalu diuji manual di toko satu hari penuh. Setiap perubahan di-commit terpisah per milestone atau per bagian.

## Pertanyaan terbuka

- [ ] **Peran admin:** dibuat sebagai peran tersendiri, atau tetap sama dengan ibu (owner)?
- [ ] **Harga jual:** apakah staf benar-benar tidak boleh mengubah harga jual dan harga beli?
- [ ] **Laporan untuk staf:** boleh melihat laporan dan laba, atau tidak?
- [ ] **Jatuh tempo:** default H+7 untuk semua pembeli, atau berbeda untuk tier A dan B?
- [ ] **Teks WhatsApp:** siapa yang menulis teks pertama?
- [ ] **Stok rusak:** siapa yang boleh membuang atau menjual barang rusak?
- [ ] **PDF:** cukup lewat "Simpan sebagai PDF" di dialog cetak, atau harus file yang langsung terunduh?
- [ ] **Laporan dari HP:** perlu tampilan khusus HP?
- [ ] **Data awal produk:** kategori mana yang diisi dulu?
- [ ] **Fase 2 rencana awal:** mana yang paling dulu dibutuhkan toko?
