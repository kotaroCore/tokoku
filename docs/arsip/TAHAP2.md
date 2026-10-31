# Tokoku: Masukan untuk Tahap 2

> Dokumen ini mengumpulkan kekurangan tahap 1 yang ditemukan saat kode dicocokkan dengan `TOKO_PROJECT_PLAN_FINAL.md` (folder induk) dan [MVP_TAHAP1.md](MVP_TAHAP1.md), ditambah lingkup fase 2 dari rencana awal. Isinya masukan, bukan keputusan: urutan dan detail tetap ditentukan pemilik.

## Ringkasan dan lingkup

| Milestone | Isi | Bisa mulai? |
| --- | --- | --- |
| M0 | Penyamaan dokumen dengan kode, bersihkan skema ganda, uji otomatis | Ya |
| M1 | Peran admin, hak ubah harga, catatan perubahan | Setelah keputusan peran (lihat pertanyaan terbuka) |
| M2 | Tindak lanjut stok rusak | Ya |
| M3 | Hutang: jatuh tempo, nama mirip, teks WhatsApp | Ya |
| M4 | Laporan lanjutan dan ekspor PDF | Ya |
| M5 | Diskon nominal, input stok awal bertahap | Ya |
| M6 | Lingkup fase 2 dari rencana awal (PO supplier, pajak, redenominasi, VPS) | Menunggu keputusan pemilik |
| Nanti | Toko online dan sinkronisasi stok | Fase 3 |

**Aturan yang tetap berlaku:** data (produk, pengguna, supplier, pembeli) tidak dihapus, hanya dinonaktifkan; kasir tidak menampilkan warna, warna dicocokkan di cek sore; pembelian ke supplier selalu lunas, jadi tidak ada hutang supplier; harga beli diatur manual.

**Hutang tahap 1** yang harus selesai sebelum tahap 1 dinyatakan selesai (kriteria di MVP_TAHAP1 bagian 7):

- [ ] Ekspor laporan harian ke PDF (kriteria 6), dikerjakan di M4.
- [ ] Uji lunas, batal, retur, dan barang masuk tanpa data rusak (kriteria 8), dikerjakan di M0.
- [ ] Stok per warna dicocokkan dengan hitungan fisik sekali (kriteria 3). Ini pekerjaan di toko, bukan kode; dibantu input stok awal bertahap di M5.

## M0 — Penyamaan dokumen dan kebersihan teknis

Kode adalah acuan utama. M0 menyamakan dokumen dengan kode, bukan sebaliknya.

- **Perbarui status di MVP_TAHAP1.md.** Banyak butir masih tertulis "Belum" padahal sudah berjalan: nomor nota `NT-YYYYMMDD-####`, status draf/lunas/batal, konfirmasi e-wallet dan transfer, pembulatan manual, tier pembeli, batas Rp 100.000 hutang lama, pelunasan urut nota tertua, saldo titipan, retur 7 hari, stok rusak terpisah, tukar barang, status kiriman barang masuk, harga beli terakhir dan peringatannya, tiga dompet, uang keluar, hitung laci, dan cek sore lengkap.
- **Satu skema saja.** `lib/nota.js` dan `db/schema_fase1.sql` (tabel `nota`, `hutang`, `mutasi_stok`, dst.) tidak dipakai aplikasi; aplikasi memakai tabel di `lib/db.js` lewat `lib/sales.js`. Pilih: arsipkan keduanya, atau pindahkan logika yang masih berguna ke `lib/sales.js`.
- **Uji otomatis untuk kode yang benar-benar dipakai.** `scripts/uji_nota.mjs` saat ini menguji `lib/nota.js`, bukan kode kasir. Ganti agar menguji `lib/sales.js`, `lib/purchases.js`, retur, dan dompet: lunas, batal, retur sebagian, tukar barang, barang masuk dicicil, stok tidak minus, hutang tidak minus.

## M1 — Hak akses dan catatan perubahan

- **Peran admin.** Saat ini hanya `owner` dan `staff`. Rencana menyebut admin (anak) mengurus produk, stok, pembelian, dan hutang.
- **Harga jual.** `PUT /api/products` hanya memeriksa login, jadi semua staf bisa mengubah harga jual dan harga satuan. Rencana: hanya ibu dan admin.
- **Catatan perubahan.** Transaksi sudah mencatat siapa pelakunya; perubahan produk, harga, satuan, koreksi stok, pengguna, dan pengaturan belum. Usulan: satu tabel catatan (siapa, kapan, apa, nilai lama, nilai baru) dan halaman lihat di panel owner.

## M2 — Tindak lanjut stok rusak

Kolom `stok_rusak` sudah terisi dari retur, tetapi belum ada jalan keluarnya.

- Jual barang rusak dengan diskon (stok rusak berkurang, tercatat di nota).
- Buang / hapus dari stok rusak dengan alasan wajib.
- Kembalikan ke supplier: tercatat per supplier, stok rusak berkurang, nilai pengembalian (uang atau ganti barang) dicatat.
- Laporan stok rusak: jumlah dan nilai per produk.

## M3 — Hutang

- **Jatuh tempo.** Rencana awal: default H+7 atau diatur saat transaksi. Belum ada kolomnya, jadi hutang lewat tempo belum bisa dilihat.
- **Nama mirip.** Saran nama sudah ada, tetapi belum memperingatkan nama yang mirip (mis. "Andi Baki" dan "Andi Bakii") untuk mencegah pembeli ganda.
- **Teks pengingat WhatsApp** bisa diatur owner dari panel.

## M4 — Laporan lanjutan

Dari rencana bagian 7 yang belum ada:

- Rincian penjualan per kategori (benang, furing, resleting, benik, kain).
- Tren mingguan dan bulanan.
- Pergerakan stok per produk (masuk, terjual, retur, koreksi, rusak) dari satu tempat.
- Barang laris dan lambat laku.
- Hutang lewat jatuh tempo (setelah M3).
- **Ekspor PDF langsung** untuk laporan harian. Saat ini baru cetak lewat browser dan CSV.

## M5 — Diskon dan data awal

- **Diskon nominal (rupiah).** Diskon saat ini hanya persen. Rencana menyebut jenis, nilai, dan siapa pemberi diskon.
- **Input stok awal bertahap per kategori.** Benang lebih dari 500 item beserta warnanya; perlu layar isi cepat per kategori (bisa dicicil, bisa dilanjutkan esok hari).

## M6 — Lingkup fase 2 dari rencana awal

Butir ini sudah ada di rencana sejak awal dan belum diurutkan pemilik:

- PO ke supplier (tanpa hutang supplier, karena pembelian selalu lunas) dan pelacakan pembelian.
- PPh / PPN, laporan pajak (PBK), persiapan E-Faktur.
- Persiapan redenominasi rupiah.
- Pindah dari komputer toko ke VPS.
- Modul gudang formal: lokasi rak, opname.

## Pertanyaan terbuka

Dibawa dari MVP_TAHAP1 bagian 6 yang belum dijawab, ditambah yang baru:

- [ ] Peran admin: peran tersendiri, atau sama dengan ibu?
- [ ] Apakah staf benar-benar tidak boleh mengubah harga jual?
- [ ] Teks pengingat WhatsApp: siapa yang menulis?
- [ ] Diskon nominal: disimpan sebagai rupiah, atau dikonversi ke persen?
- [ ] Input data awal produk: sekaligus atau bertahap per kategori?
- [ ] Laporan harian: perlu dibuka dari HP?
- [ ] Jatuh tempo hutang: default H+7 untuk semua tier, atau beda per tier?
- [ ] Stok rusak: siapa yang boleh membuang atau menjual dengan diskon?
- [ ] Urutan M6: mana yang paling dulu dibutuhkan toko?
