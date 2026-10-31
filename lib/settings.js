import { query } from '@/lib/db';

// Pengaturan toko yang diatur admin di panel. Disimpan sebagai pasangan kunci-nilai di tabel settings.
export const DEFAULTS = {
  idle_enabled: '1',
  idle_minutes: '15',
  close_time: '16:00', // sesudah jam ini logout otomatis tidak lagi ditunda walau ada transaksi
  backup_enabled: '1',
  backup_mode: 'daily', // daily | 6h | weekly
  backup_time: '16:30',
  backup_weekday: '0', // 0 = Minggu (hanya untuk mode weekly)
  backup_dir: '',
  backup_keep_days: '30',
  nama_toko: 'Toko',
  hutang_tempo_hari: '7', // jatuh tempo bawaan nota berhutang (hari)
  hari_lambat_laku: '30', // laporan: produk aktif yang tidak terjual N hari
  // Penanda: {nama}, {total}, {rincian}, {toko}, {lewat_tempo}
  wa_pengingat: 'Assalamualaikum, ini pengingat pembayaran hutang dari {toko}.\n- Nama: {nama}\n- Total: {total}\n{rincian}\n{lewat_tempo}\nTerima kasih 🙏',
};

export const IDLE_CHOICES = [5, 10, 15, 30, 60];

const g = globalThis;

export async function getSettings() {
  const c = g.__tokokuSettings;
  if (c && Date.now() - c.at < 10000) return c.value;
  const rows = await query('SELECT k, v FROM settings');
  const value = { ...DEFAULTS };
  for (const r of rows) if (r.k in DEFAULTS) value[r.k] = r.v;
  g.__tokokuSettings = { at: Date.now(), value };
  return value;
}

export async function saveSettings(patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULTS)) continue;
    await query('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, String(v)]);
  }
  g.__tokokuSettings = null;
}

// Data internal (hasil backup terakhir, dll.) memakai tabel yang sama tetapi tidak ikut DEFAULTS.
export async function getState(k) {
  const rows = await query('SELECT v FROM settings WHERE k = ?', [k]);
  return rows[0]?.v ?? '';
}

export async function setState(k, v) {
  await query('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, String(v)]);
}

export function idleConfig(s) {
  const minutes = Number(s.idle_minutes);
  return { enabled: s.idle_enabled === '1' && minutes > 0, minutes, closeTime: s.close_time };
}

// Apakah jam sekarang (jam server) sudah lewat jam tutup toko.
export function pastClosing(closeTime, now = new Date()) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(closeTime || '');
  if (!m) return false;
  return now.getHours() * 60 + now.getMinutes() >= Number(m[1]) * 60 + Number(m[2]);
}

export async function addNotice(kind, message) {
  await query('INSERT INTO notices (kind, message) VALUES (?, ?)', [kind, String(message).slice(0, 500)]);
}
