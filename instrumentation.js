// Dijalankan sekali saat server Next.js menyala: pemicu backup otomatis (cek tiap menit).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const g = globalThis;
  if (g.__tokokuBackupTimer) return;
  const { tickBackup } = await import('./lib/backup.js');
  const tick = () => tickBackup().catch((e) => console.error('[backup]', e.message));
  g.__tokokuBackupTimer = setInterval(tick, 60000);
  setTimeout(tick, 15000); // cek sekali tak lama setelah menyala (mengejar jadwal yang terlewat)
}
