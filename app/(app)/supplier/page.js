'use client';
import { useEffect, useState } from 'react';
import Modal from '../Modal';

const blank = { id: null, name: '', phone: '', address: '', note: '' };

export default function Supplier() {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [showOff, setShowOff] = useState(false);

  const load = () => fetch('/api/suppliers?all=1').then((r) => r.json()).then(setRows);
  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    setErr('');
    const r = await fetch('/api/suppliers', {
      method: f.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
    });
    const d = await r.json();
    if (!r.ok) return setErr(d.error);
    setF(null);
    load();
  }

  async function toggle(s) {
    if (s.active && !confirm(`Nonaktifkan supplier "${s.name}"?`)) return;
    await fetch('/api/suppliers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, active: !s.active }) });
    load();
  }

  const shown = rows.filter((s) => (showOff || s.active) && `${s.name} ${s.phone || ''} ${s.address || ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <h1>Supplier</h1>
      <div className="card row">
        <div><label>Cari</label><input value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div><label><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} style={{ width: 'auto' }} /> Tampilkan nonaktif</label></div>
        <div><button onClick={() => { setF({ ...blank }); setErr(''); }}>+ Supplier baru</button></div>
      </div>

      {f && (
        <Modal title={f.id ? 'Ubah supplier' : 'Supplier baru'} onClose={() => setF(null)}>
          <form onSubmit={save}>
            <div className="row">
              <div className="field"><label>Nama supplier / toko</label><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
              <div className="field"><label>Telepon / WhatsApp</label><input inputMode="tel" value={f.phone || ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            </div>
            <div className="field"><label>Alamat</label><input value={f.address || ''} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
            <div className="field"><label>Catatan (barang yang dipasok, jatuh tempo bayar, dll.)</label><input value={f.note || ''} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
            {err && <div className="alert err">{err}</div>}
            <button>Simpan</button>
          </form>
        </Modal>
      )}

      <div className="card">
        <table>
          <thead><tr><th>Supplier</th><th>Kontak</th><th>Catatan</th><th></th></tr></thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} style={s.active ? undefined : { opacity: 0.5 }}>
                <td>{s.name}{!s.active && ' · NONAKTIF'}</td>
                <td>{s.phone || '-'}<div className="muted">{s.address}</div></td>
                <td className="muted">{s.note}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="secondary" onClick={() => { setF({ ...s }); setErr(''); }}>Ubah</button>{' '}
                  <button className="secondary" onClick={() => toggle(s)}>{s.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan="4" className="muted">Belum ada supplier.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
