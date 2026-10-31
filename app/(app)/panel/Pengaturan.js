'use client';
import { useEffect, useState } from 'react';

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MODES = { daily: 'Setiap hari (jam tertentu)', '6h': 'Setiap 6 jam', weekly: 'Mingguan' };
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'belum pernah');

// Pengaturan keamanan (logout otomatis) dan backup database. Khusus admin (panel).
export default function Pengaturan() {
  const [data, setData] = useState(null);
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);

  async function load() {
    const d = await fetch('/api/settings').then((r) => r.json());
    setData(d);
    setS((cur) => cur || d.settings);
  }
  useEffect(() => { load(); }, []);

  const set = (k, v) => setS((cur) => ({ ...cur, [k]: v }));
  const say = (card, text, err) => setMsg((m) => ({ ...m, [card]: text ? { text, err } : null }));

  async function save(card, keys, ok) {
    say(card, '');
    const body = {};
    for (const k of keys) body[k] = k.endsWith('_enabled') ? s[k] === '1' : s[k];
    const r = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) return say(card, d.error, true);
    setData((cur) => ({ ...cur, backup: d.backup }));
    say(card, ok);
  }

  async function backupNow() {
    const last = data.backup;
    const ok = confirm(
      `Backup database sekarang?\n\nBackup terakhir: ${fmtTime(last.last_at)}${last.last_status === 'gagal' ? ' (GAGAL)' : ''}\nDisimpan ke: ${last.dir}\n\nProses beberapa detik dan aman dilakukan saat toko buka.`
    );
    if (!ok) return;
    setBusy(true);
    say('backup', '');
    const r = await fetch('/api/backup', { method: 'POST' });
    const d = await r.json();
    setBusy(false);
    if (r.ok) say('backup', `Backup berhasil: ${d.file} (${fmtSize(d.size)})${d.removed ? `. ${d.removed} backup lama dihapus.` : '.'}`);
    else say('backup', `Backup GAGAL: ${d.error}`, true);
    load();
  }

  if (!s || !data) return <div className="card muted">Memuat pengaturan…</div>;
  const b = data.backup;
  const Msg = ({ card }) => (msg[card] ? <div className={`alert ${msg[card].err ? 'err' : 'ok'}`}>{msg[card].text}</div> : null);

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Keamanan: logout otomatis</h2>
        <p className="muted">
          Berlaku untuk semua pengguna (admin dan staf). Shift tetap berjalan; hanya sesi login yang berakhir, dan masuk lagi melanjutkan shift yang sama.
          Selama kasir mengerjakan transaksi (keranjang terisi), logout ditunda dan Anda diberi tahu lewat pop-up. Sesudah jam tutup, logout tidak lagi ditunda.
        </p>
        <div className="field">
          <label><input type="checkbox" checked={s.idle_enabled === '1'} onChange={(e) => set('idle_enabled', e.target.checked ? '1' : '0')} /> Aktifkan logout otomatis</label>
        </div>
        <div className="row">
          <div className="field">
            <label>Keluar setelah tidak aktif selama</label>
            <select value={s.idle_minutes} disabled={s.idle_enabled !== '1'} onChange={(e) => set('idle_minutes', e.target.value)}>
              {data.idleChoices.map((m) => <option key={m} value={m}>{m} menit{m === 15 ? ' (bawaan)' : ''}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Jam tutup toko</label>
            <input type="time" value={s.close_time} disabled={s.idle_enabled !== '1'} onChange={(e) => set('close_time', e.target.value)} />
          </div>
        </div>
        <Msg card="idle" />
        <button onClick={() => save('idle', ['idle_enabled', 'idle_minutes', 'close_time'], 'Pengaturan logout otomatis disimpan.')}>Simpan</button>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Toko, hutang, dan pengingat WhatsApp</h2>
        <div className="row">
          <div className="field"><label>Nama toko (untuk {'{toko}'})</label><input value={s.nama_toko} onChange={(e) => set('nama_toko', e.target.value)} /></div>
          <div className="field"><label>Jatuh tempo hutang bawaan (hari)</label><input inputMode="numeric" value={s.hutang_tempo_hari} onChange={(e) => set('hutang_tempo_hari', e.target.value)} /></div>
          <div className="field"><label>Laporan: produk lambat laku bila tidak terjual (hari)</label><input inputMode="numeric" value={s.hari_lambat_laku} onChange={(e) => set('hari_lambat_laku', e.target.value)} /></div>
        </div>
        <div className="field">
          <label>Teks pengingat hutang WhatsApp</label>
          <textarea rows={7} value={s.wa_pengingat} onChange={(e) => set('wa_pengingat', e.target.value)} style={{ width: '100%', fontFamily: 'inherit' }} />
          <div className="muted">Penanda: {'{nama}'} nama pembeli, {'{total}'} total hutang, {'{rincian}'} daftar nota (nomor, tanggal, sisa, jatuh tempo), {'{toko}'} nama toko, {'{lewat_tempo}'} jumlah nota yang lewat jatuh tempo (kosong bila tidak ada).</div>
        </div>
        <Msg card="toko" />
        <button onClick={() => save('toko', ['nama_toko', 'hutang_tempo_hari', 'hari_lambat_laku', 'wa_pengingat'], 'Pengaturan toko dan hutang disimpan.')}>Simpan</button>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Backup database</h2>
        <p className="muted">
          Yang disimpan: seluruh isi database (semua tabel) dalam satu file terkompres, dibuat tanpa mengganggu kasir.
          Arahkan folder ke folder Google Drive for Desktop agar otomatis naik ke Drive. Backup yang lebih lama dari batas simpan dihapus sendiri.
        </p>
        <div className="field">
          <label><input type="checkbox" checked={s.backup_enabled === '1'} onChange={(e) => set('backup_enabled', e.target.checked ? '1' : '0')} /> Backup otomatis</label>
        </div>
        <div className="row">
          <div className="field">
            <label>Jadwal</label>
            <select value={s.backup_mode} disabled={s.backup_enabled !== '1'} onChange={(e) => set('backup_mode', e.target.value)}>
              {Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {s.backup_mode === 'weekly' && (
            <div className="field">
              <label>Hari</label>
              <select value={s.backup_weekday} disabled={s.backup_enabled !== '1'} onChange={(e) => set('backup_weekday', e.target.value)}>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
          )}
          {s.backup_mode !== '6h' && (
            <div className="field">
              <label>Jam</label>
              <input type="time" value={s.backup_time} disabled={s.backup_enabled !== '1'} onChange={(e) => set('backup_time', e.target.value)} />
            </div>
          )}
          <div className="field">
            <label>Simpan selama (hari)</label>
            <input type="number" min="1" max="365" value={s.backup_keep_days} onChange={(e) => set('backup_keep_days', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Folder tujuan (kosong = folder bawaan <code>data/backups</code> di komputer ini)</label>
          <input value={s.backup_dir} placeholder="mis. G:\My Drive\Backup Tokoku" onChange={(e) => set('backup_dir', e.target.value)} />
        </div>
        <Msg card="backup" />
        <button onClick={() => save('backup', ['backup_enabled', 'backup_mode', 'backup_time', 'backup_weekday', 'backup_keep_days', 'backup_dir'], 'Pengaturan backup disimpan.')}>Simpan</button>{' '}
        <button className="secondary" disabled={busy || b.busy} onClick={backupNow}>{busy ? 'Membackup…' : 'Backup sekarang'}</button>

        <p style={{ marginBottom: 4 }}>
          <b>Backup terakhir:</b> {fmtTime(b.last_at)}{' '}
          {b.last_status === 'gagal' && <span className="badge red">GAGAL</span>}
          {b.last_status === 'ok' && <span className="badge ok">berhasil</span>}
        </p>
        {b.last_info && <div className="muted">{b.last_info}</div>}
        <div className="muted">Folder aktif: {b.dir}</div>

        {b.files.length > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary>{b.files.length} backup tersimpan</summary>
            <table>
              <tbody>
                {b.files.map((f) => (
                  <tr key={f.file}><td>{f.file}</td><td className="r">{fmtSize(f.size)}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
        <p className="muted" style={{ marginTop: 10 }}>
          Memulihkan data sengaja tidak ada tombolnya di sini (terlalu berbahaya sekali klik). Hentikan aplikasi, lalu jalankan <code>npm run restore</code> di folder proyek dan ikuti petunjuknya.
        </p>
      </div>
    </>
  );
}
