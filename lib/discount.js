// Aturan diskon otomatis (MVP). Detail masih perlu konfirmasi owner; kasir bisa override manual.
export function autoDiscount(category, unitName, qty, factor) {
  const base = qty * factor;
  if (category === 'BENANG' && /dosin|gross|mass/i.test(unitName) && qty * factor >= 60) return 10;
  if (category === 'BENIK' && base >= 50) return 5;
  if (['FURING', 'RESLETING', 'KAIN'].includes(category) && /meter/i.test(unitName) && base >= 5) return 5;
  return 0;
}
