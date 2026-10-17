import { query } from '@/lib/db';
import { requireOwnerApi } from '@/lib/auth';
import { getSettings, saveSettings, IDLE_CHOICES } from '@/lib/settings';
import { backupStatus, checkDir } from '@/lib/backup';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET() {
  const { error } = await requireOwnerApi();
  if (error) return error;
  return Response.json({ settings: await getSettings(), backup: await backupStatus(), idleChoices: IDLE_CHOICES });
}

// Owner menyimpan pengaturan; setiap nilai divalidasi sebelum disimpan.
export async function PUT(req) {
  const { error } = await requireOwnerApi();
  if (error) return error;
  const b = await req.json();
  const out = {};
  const bad = (m) => Response.json({ error: m }, { status: 400 });

  if ('idle_enabled' in b) out.idle_enabled = b.idle_enabled ? '1' : '0';
  if ('idle_minutes' in b) {
    if (!IDLE_CHOICES.includes(Number(b.idle_minutes))) return bad('Pilihan batas diam tidak valid.');
    out.idle_minutes = String(Number(b.idle_minutes));
  }
  if ('close_time' in b) {
    if (!TIME_RE.test(b.close_time)) return bad('Jam tutup tidak valid (format JJ:MM).');
    out.close_time = b.close_time;
  }
  if ('backup_enabled' in b) out.backup_enabled = b.backup_enabled ? '1' : '0';
  if ('backup_mode' in b) {
    if (!['daily', '6h', 'weekly'].includes(b.backup_mode)) return bad('Jadwal backup tidak valid.');
    out.backup_mode = b.backup_mode;
  }
  if ('backup_time' in b) {
    if (!TIME_RE.test(b.backup_time)) return bad('Jam backup tidak valid (format JJ:MM).');
    out.backup_time = b.backup_time;
  }
  if ('backup_weekday' in b) {
    const d = Number(b.backup_weekday);
    if (!Number.isInteger(d) || d < 0 || d > 6) return bad('Hari backup tidak valid.');
    out.backup_weekday = String(d);
  }
  if ('backup_keep_days' in b) {
    const d = Number(b.backup_keep_days);
    if (!Number.isInteger(d) || d < 1 || d > 365) return bad('Lama simpan backup harus 1–365 hari.');
    out.backup_keep_days = String(d);
  }
  if ('backup_dir' in b) {
    const dir = String(b.backup_dir || '').trim();
    try {
      checkDir(dir); // buat folder bila belum ada & pastikan bisa ditulis
    } catch (e) {
      return bad(`Folder backup tidak bisa dipakai: ${e.message}`);
    }
    out.backup_dir = dir;
  }
  await saveSettings(out);
  // Aktivitas terakhir bisa basi bila fitur sempat mati; mulai hitung dari sekarang agar tak ada yang langsung terlempar.
  if ('idle_enabled' in out || 'idle_minutes' in out) await query('UPDATE shifts SET last_active = NOW() WHERE ended_at IS NULL');
  return Response.json({ ok: true, settings: await getSettings(), backup: await backupStatus() });
}
