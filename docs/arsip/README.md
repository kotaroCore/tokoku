# Arsip

Berkas di folder ini **tidak dipakai aplikasi**. Disimpan hanya sebagai catatan sejarah.

| Berkas | Isi |
|---|---|
| `schema_fase1.sql` | Rancangan awal tabel fase 1 (`nota`, `hutang`, `mutasi_stok`, dst.). Aplikasi memakai skema di `lib/db.js` (`SCHEMA` dan `MIGRATIONS`). |
| `nota.js` | Logika nota untuk rancangan awal di atas. Digantikan `lib/sales.js`. |
| `uji_nota.mjs` | Uji untuk `nota.js`. Digantikan `scripts/uji.mjs` (`npm run uji`). |
| `migrasi_dari_prototipe.sql` | Migrasi data prototipe ke rancangan awal. Hanya menulis ke skema lama, jadi ikut diarsipkan. |
| `SPESIFIKASI_TAHAP2.md`, `TAHAP2.md` | Bahan dan rancangan tahap 2 sebelumnya. Digantikan `docs/SPESIFIKASI_TAHAP2_RESMI.md`. |

`SKEMA_DATABASE_FASE1.md` yang disebut di spesifikasi tidak ada di repositori, jadi tidak ada yang dipindahkan.
