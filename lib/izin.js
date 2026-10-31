// Peran dan izin. Admin boleh semua. Staf boleh semua kecuali yang di IZIN dan panel,
// kecuali admin memberi izin per orang (tabel izin_pengguna).
// Tidak memakai next/* supaya bisa dipanggil langsung dari uji otomatis.

export const ROLES = ['admin', 'staff'];

export const IZIN = {
  ubah_harga: 'Ubah harga jual dan harga satuan',
  ubah_modal: 'Ubah harga beli (modal), termasuk lewat barang masuk',
  buang_rusak: 'Buang stok rusak',
  laporan_laba: 'Lihat laba dan modal di laporan',
};

export class Forbidden extends Error {}

// session: { role, izin: [...] }
export function boleh(session, izin) {
  if (!session) return false;
  if (session.role === 'admin') return true;
  return (session.izin || []).includes(izin);
}

export function wajibIzin(session, izin) {
  if (!boleh(session, izin)) throw new Forbidden(`Tidak punya izin: ${IZIN[izin] || izin}. Minta izin ke admin.`);
}

export async function izinPengguna(q, userId) {
  const rows = await q('SELECT izin FROM izin_pengguna WHERE user_id = ?', [userId]);
  return rows.map((r) => r.izin).filter((k) => k in IZIN);
}
