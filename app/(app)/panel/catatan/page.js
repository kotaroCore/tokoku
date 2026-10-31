'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const OBJEK = { produk: 'Produk', satuan: 'Satuan', warna: 'Warna', stok: 'Stok', pembeli: 'Pembeli', supplier: 'Supplier', pengguna: 'Pengguna', pengaturan: 'Pengaturan', izin: 'Izin' };
const AKSI = { tambah: 'Tambah', ubah: 'Ubah', nonaktif: 'Nonaktifkan', aktif: 'Aktifkan', beri_izin: 'Beri izin', cabut_izin: 'Cabut izin', hapus: 'Hapus' };
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// Isi JSON lama/baru ditampilkan sebagai "kolom: nilai".
function Isi({ v }) {
  if (v == null) return <span className="muted">-</span>;
  if (typeof v !== 'object') return <>{String(v)}</>;
  return Object.entries(v).map(([k, x]) => <div key={k}><span className="muted">{k}:</span> {x == null ? '-' : String(x)}</div>);
}

export default function Catatan() {
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [f, setF] = useState({ objek: '', user_id: '', from: today(), to: today() });

  useEffect(() => { fetch('/api/users').then((r) => r.json()).then(setUsers); }, []);
  useEffect(() => {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    fetch(`/api/catatan?${qs}`).then((r) => r.json()).then(setRows);
  }, [f]);
  const set = (k, v) => setF({ ...f, [k]: v });

  return (
    <>
      <h1>Catatan perubahan</h1>
      <p className="muted">Siapa mengubah apa, dengan nilai lama dan baru. Penjualan, retur, dan barang masuk punya riwayat sendiri. <Link href="/panel">← Panel</Link></p>
      <div className="card row">
        <div><label>Objek</label>
          <select value={f.objek} onChange={(e) => set('objek', e.target.value)}>
            <option value="">Semua</option>
            {Object.entries(OBJEK).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div><label>Pengguna</label>
          <select value={f.user_id} onChange={(e) => set('user_id', e.target.value)}>
            <option value="">Semua</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div><label>Dari</label><input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} /></div>
        <div><label>Sampai</label><input type="date" value={f.to} onChange={(e) => set('to', e.target.value)} /></div>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Waktu</th><th>Oleh</th><th>Objek</th><th>Aksi</th><th>Lama</th><th>Baru</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{r.dibuat_pada.slice(0, 16).replace('T', ' ')}</td>
                <td>{r.oleh}</td>
                <td>{OBJEK[r.objek] || r.objek}{r.objek_id ? ` #${r.objek_id}` : ''}</td>
                <td>{AKSI[r.aksi] || r.aksi}</td>
                <td><Isi v={r.lama} /></td>
                <td><Isi v={r.baru} /></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="6" className="muted">Tidak ada catatan di rentang ini.</td></tr>}
          </tbody>
        </table>
        {rows.length >= 500 && <p className="muted">Hanya 500 catatan terbaru yang ditampilkan. Persempit saringan.</p>}
      </div>
    </>
  );
}
