// Penanda "sedang transaksi" di browser. Halaman yang menyimpan pekerjaan belum selesai (mis. keranjang kasir)
// memanggil setBusy('pos', true); selama ada yang true, logout otomatis ditunda.
export function setBusy(key, on) {
  if (typeof window === 'undefined') return;
  const set = (window.__tkBusy ||= new Set());
  if (on) set.add(key);
  else set.delete(key);
}

export function isBusy() {
  return typeof window !== 'undefined' && !!window.__tkBusy && window.__tkBusy.size > 0;
}
