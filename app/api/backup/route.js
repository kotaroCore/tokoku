import { requireRoleApi } from '@/lib/auth';
import { runBackup } from '@/lib/backup';

// Backup manual (khusus admin). Konfirmasi ditampilkan di browser sebelum memanggil ini.
export async function POST() {
  const { error } = await requireRoleApi('admin');
  if (error) return error;
  try {
    const r = await runBackup('manual');
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
