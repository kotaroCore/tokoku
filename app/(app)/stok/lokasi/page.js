'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

// Daftar lokasi seragam (ruangan / lemari / rak) untuk mengisi lokasi utama warna dan tempat saat opname.
// Lokasi tidak dihapus, hanya dinonaktifkan.
export default function Lokasi() {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ ruangan: '', lemari: '', rak: '' });
  const [err, setErr] = useState('');

  const load = () => fetch('/api/lokasi?all=1').then((r) => r.json()).then(setRows);
  useEffect(() => { load(); }, []);

  async function tambah(e) {
    e.preventDefault();
    setErr('');
    const r = await fetch('/api/lokasi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    const d = await r.json();
    if (!r.ok) return setErr(d.error);
    setF({ ...f, rak: '' });
    load();
  }

  async function toggle(l) {
    await fetch('/api/lokasi', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id, aktif: !l.aktif }) });
    load();
  }

  return (
    <>
      <h1>Lokasi rak</h1>
      <p className="muted">Lokasi hanya untuk mencari barang; stok tetap satu angka per warna. <Link href="/stok">← Stok</Link> · <Link href="/stok/opname">Opname per warna</Link></p>
      <form className="card row" onSubmit={tambah}>
        <div className="field"><label>Ruangan</label><input required value={f.ruangan} onChange={(e) => setF({ ...f, ruangan: e.target.value })} placeholder="mis. Toko, Gudang" /></div>
        <div className="field"><label>Lemari</label><input value={f.lemari} onChange={(e) => setF({ ...f, lemari: e.target.value })} placeholder="mis. Lemari A" /></div>
        <div className="field"><label>Rak</label><input value={f.rak} onChange={(e) => setF({ ...f, rak: e.target.value })} placeholder="mis. Rak 2" /></div>
        <div><button>+ Tambah lokasi</button></div>
        {err && <div className="alert err">{err}</div>}
      </form>
      <div className="card">
        <table>
          <thead><tr><th>Lokasi</th><th></th></tr></thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} style={l.aktif ? undefined : { opacity: 0.5 }}>
                <td>{l.label}{!l.aktif && ' · NONAKTIF'}</td>
                <td><button className="secondary" onClick={() => toggle(l)}>{l.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="2" className="muted">Belum ada lokasi.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
