import { getSettings, getState, setState, addNotice } from '@/lib/settings';
import { dumpTo, resolveDir, pruneBackups, listBackups, ensureDir } from '@/lib/backup-core';

const g = globalThis;
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

// Jalankan backup. trigger: 'manual' | 'auto'. Hanya satu backup berjalan pada satu waktu.
export async function runBackup(trigger) {
  if (g.__tokokuBackupBusy) throw new Error('Backup lain sedang berjalan.');
  g.__tokokuBackupBusy = true;
  const s = await getSettings();
  const dir = resolveDir(s.backup_dir);
  const label = trigger === 'auto' ? 'Backup otomatis' : 'Backup manual';
  const now = () => new Date().toISOString();
  try {
    await setState('backup_last_attempt', now());
    const { file, size } = await dumpTo(dir);
    const removed = pruneBackups(dir, Number(s.backup_keep_days) || 30);
    await setState('backup_last_at', now());
    await setState('backup_last_status', 'ok');
    await setState('backup_last_info', `${file} (${fmtSize(size)}) — ${trigger === 'auto' ? 'otomatis' : 'manual'}`);
    if (trigger === 'auto') await addNotice('ok', `${label} berhasil: ${file} (${fmtSize(size)})${removed ? `; ${removed} backup lama dihapus` : ''}.`);
    return { file, size, removed };
  } catch (e) {
    await setState('backup_last_status', 'gagal');
    await setState('backup_last_info', String(e.message).slice(0, 300));
    if (trigger === 'auto') await addNotice('err', `${label} GAGAL: ${e.message}`);
    throw e;
  } finally {
    g.__tokokuBackupBusy = false;
  }
}

export async function backupStatus() {
  const s = await getSettings();
  const dir = resolveDir(s.backup_dir);
  return {
    dir,
    last_at: await getState('backup_last_at'),
    last_status: await getState('backup_last_status'),
    last_info: await getState('backup_last_info'),
    files: listBackups(dir).slice(0, 40),
    busy: !!g.__tokokuBackupBusy,
  };
}

export function checkDir(dir) {
  ensureDir(resolveDir(dir));
}

// Jadwal terakhir yang seharusnya sudah menjalankan backup (jam server).
function lastSlot(s, now = new Date()) {
  if (s.backup_mode === '6h') return new Date(now.getTime() - 6 * 3600000);
  const [h, m] = (s.backup_time || '16:30').split(':').map(Number);
  const slot = new Date(now);
  slot.setHours(h, m, 0, 0);
  if (s.backup_mode === 'weekly') {
    slot.setDate(slot.getDate() - ((slot.getDay() - Number(s.backup_weekday) + 7) % 7));
  }
  const step = s.backup_mode === 'weekly' ? 7 : 1;
  if (slot > now) slot.setDate(slot.getDate() - step);
  return slot;
}

// Dipanggil tiap menit oleh instrumentation.js. Bila PC sempat mati saat jadwal, backup dikejar saat menyala lagi.
export async function tickBackup() {
  if (g.__tokokuBackupBusy) return;
  const s = await getSettings();
  if (s.backup_enabled !== '1') return;
  const now = new Date();
  const lastOk = await getState('backup_last_at');
  const lastTry = await getState('backup_last_attempt');
  const slot = lastSlot(s, now);
  if (lastOk && new Date(lastOk) >= slot) return;
  // Setelah gagal, tunggu 30 menit sebelum mencoba lagi.
  if (lastTry && new Date(lastTry) >= slot && (await getState('backup_last_status')) === 'gagal' && now - new Date(lastTry) < 30 * 60000) return;
  await runBackup('auto').catch(() => {});
}
