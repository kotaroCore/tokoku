import { query, queryOne } from '@/lib/db';
import { requireApi } from '@/lib/auth';
import { getSettings, idleConfig, pastClosing, addNotice } from '@/lib/settings';

// Denyut dari browser: { activity, busy, atLimit }.
//  activity -> pengguna baru saja bergerak/mengetik (menyegarkan batas diam)
//  busy     -> ada transaksi yang sedang dikerjakan (keranjang terisi)
//  atLimit  -> browser merasa batas diam sudah tercapai; server memutuskan: ok | defer | logout
export async function POST(req) {
  const { session, error } = await requireApi();
  if (error) return error;
  const { activity, busy, atLimit } = await req.json().catch(() => ({}));
  const cfg = idleConfig(await getSettings());
  const sid = session.shiftId;

  if (sid) {
    if (activity) await query('UPDATE shifts SET last_active = NOW(), busy_notified = 0 WHERE id = ?', [sid]);
    await query(busy ? 'UPDATE shifts SET busy_at = NOW() WHERE id = ?' : 'UPDATE shifts SET busy_at = NULL WHERE id = ?', [sid]);
  }
  const row = sid ? await queryOne('SELECT TIMESTAMPDIFF(SECOND, last_active, NOW()) AS idle_s, busy_notified FROM shifts WHERE id = ?', [sid]) : null;
  const idleSeconds = row?.idle_s ?? 0;

  let action = 'ok';
  if (cfg.enabled && atLimit && idleSeconds >= cfg.minutes * 60 - 2) {
    if (busy && !pastClosing(cfg.closeTime)) {
      action = 'defer';
      if (!row.busy_notified) {
        await query('UPDATE shifts SET busy_notified = 1 WHERE id = ?', [sid]);
        await addNotice(
          'warn',
          `Logout otomatis ditunda: ${session.name} sedang mengerjakan transaksi (diam ${cfg.minutes} menit). Akan keluar sendiri setelah transaksi selesai atau lewat jam tutup ${cfg.closeTime}.`
        );
      }
    } else {
      action = 'logout';
    }
  }
  return Response.json({ action, idleSeconds, enabled: cfg.enabled, minutes: cfg.minutes });
}
