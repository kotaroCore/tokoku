import { requireOwnerApi } from '@/lib/auth';
import { runBackup } from '@/lib/backup';

// Backup manual (khusus owner). Konfirmasi ditampilkan di browser sebelum memanggil ini.
export async function POST() {
  const { error } = await requireOwnerApi();
  if (error) return error;
  try {
    const r = await runBackup('manual');
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
