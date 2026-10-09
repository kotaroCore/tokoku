'use client';
import { useEffect, useState } from 'react';

const ROLE = { owner: 'Owner', staff: 'Staf' };
const blank = { username: '', name: '', password: '', role: 'staff' };

export default function Panel() {
  const [users, setUsers] = useState([]);
  const [f, setF] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => fetch('/api/users').then((r) => r.json()).then(setUsers);
  useEffect(() => { load(); }, []);

  async function patch(body, ok) {
    setMsg('');
    const r = await fetch('/api/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    setMsg(r.ok ? ok : d.error);
    load();
  }

  async function create(e) {
    e.preventDefault();
    setErr('');
    const r = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    const d = await r.json();
    if (!r.ok) return setErr(d.error);
    setF(null);
    setMsg(`Pengguna ${f.username} dibuat.`);
    load();
  }

  const toggle = (u) => {
    if (u.active && !confirm(`Nonaktifkan ${u.name}? Dia langsung tidak bisa masuk. Riwayat nota tetap tersimpan.`)) return;
    patch({ id: u.id, active: !u.active }, u.active ? `${u.name} dinonaktifkan.` : `${u.name} diaktifkan.`);
  };
  const reset = (u) => {
    const pw = prompt(`Password baru untuk ${u.name} (minimal 6 karakter):`);
    if (pw) patch({ id: u.id, password: pw }, `Password ${u.name} diganti.`);
  };
  const rename = (u) => {
    const name = prompt('Nama baru:', u.name);
    if (name?.trim()) patch({ id: u.id, name }, 'Nama diperbarui.');
  };
  const setRole = (u, role) => patch({ id: u.id, role }, `${u.name} sekarang ${ROLE[role]}.`);

  return (
    <>
      <h1>Panel kontrol <span className="muted" style={{ fontSize: '.9rem' }}>(khusus owner)</span></h1>
      <p className="muted">Staf bisa memakai semua fitur lain, kecuali panel ini. Pengguna tidak dihapus, hanya dinonaktifkan, supaya riwayat nota dan shift tetap utuh.</p>

      <div className="card row">
        <div><h2 style={{ margin: 0 }}>Pengguna</h2></div>
        <div><button onClick={() => { setF(f ? null : { ...blank }); setErr(''); }}>{f ? 'Tutup' : '+ Pengguna baru'}</button></div>
      </div>

      {msg && <div className="alert">{msg}</div>}

      {f && (
        <form className="card" onSubmit={create}>
          <h2>Pengguna baru</h2>
          <div className="row">
            <div className="field"><label>Username (untuk login)</label><input required value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoCapitalize="none" /></div>
            <div className="field"><label>Nama tampilan</label><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          </div>
          <div className="row">
            <div className="field"><label>Password awal (min. 6 karakter)</label><input required type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
            <div className="field"><label>Peran</label>
              <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                <option value="staff">Staf — semua fitur kecuali panel ini</option>
                <option value="owner">Owner — termasuk panel ini</option>
              </select>
            </div>
          </div>
          {err && <div className="alert err">{err}</div>}
          <button>Simpan</button>
        </form>
      )}

      <div className="card">
        <table>
          <thead><tr><th>Pengguna</th><th>Peran</th><th>Login terakhir</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={u.active ? undefined : { opacity: 0.5 }}>
                <td>{u.name}{!u.active && ' · NONAKTIF'}<br /><span className="muted">{u.username}</span></td>
                <td>
                  <select value={u.role} onChange={(e) => setRole(u, e.target.value)}>
                    <option value="staff">Staf</option>
                    <option value="owner">Owner</option>
                  </select>
                </td>
                <td className="muted">{u.last_login ? u.last_login.slice(0, 16).replace('T', ' ') : '-'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="secondary" onClick={() => rename(u)}>Ubah nama</button>{' '}
                  <button className="secondary" onClick={() => reset(u)}>Reset password</button>{' '}
                  <button className="secondary" onClick={() => toggle(u)}>{u.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
