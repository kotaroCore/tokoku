// Dompet toko: laci, receh, dan kulakan. Hanya uang masuk / keluar yang dicatat; pemindahan antar dompet tidak dicatat.
// Tiap perubahan masuk dompet_mutasi. Saldo dompet = jumlah seluruh mutasinya.

export const DOMPET = ['laci', 'receh', 'kulakan'];

export async function catatDompet(q, { dompet, jumlah, jenis, keterangan = null, userId, saleId = null, purchaseId = null }) {
  if (!jumlah) return;
  await q(
    'INSERT INTO dompet_mutasi (dompet, jumlah, jenis, keterangan, ref_sale_id, ref_purchase_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [dompet, jumlah, jenis, keterangan, saleId, purchaseId, userId]
  );
}

export async function saldoDompet(q, dompet) {
  const [{ s }] = await q('SELECT COALESCE(SUM(jumlah), 0) AS s FROM dompet_mutasi WHERE dompet = ?', [dompet]);
  return Number(s);
}
