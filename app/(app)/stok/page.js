'use client';
import { useEffect, useState } from 'react';
import { num } from '@/lib/format';

const LABEL = { ok: 'Aman', green: 'Mulai menipis', yellow: 'Waspada', red: 'Kritis', none: 'Tanpa level' };

export default function Stok() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [msg, setMsg] = useState('');

  const load = () => fetch('/api/stock').then((r) => r.json()).then(setRows);
  useEffect(() => { load(); }, []);

  async function adjust(v) {
    const input = prompt(`Ubah stok ${v.product_name} ${v.color} (satuan ${v.base_unit}).\nIsi + untuk tambah, - untuk kurang. Contoh: 24 atau -3`);
    if (input == null || input.trim() === '' || isNaN(Number(input))) return;
    const note = prompt('Catatan (mis. restok, rusak, hilang):') || '';
    const r = await fetch('/api/variants', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: v.id, delta: Number(input), note }),
    });
    setMsg(r.ok ? 'Stok diperbarui.' : (await r.json()).error);
    load();
  }

  async function levels(v) {
    const input = prompt(`Level reorder ${v.product_name} ${v.color} (${v.base_unit}).\nFormat: hijau,kuning,merah  Contoh: 144,108,72`, `${v.level_green},${v.level_yellow},${v.level_red}`);
    if (!input) return;
    const [g, y, r] = input.split(',').map((x) => Number(x.trim()));
    if ([g, y, r].some((x) => isNaN(x))) return setMsg('Format level salah.');
    await fetch('/api/variants', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: v.id, level_green: g, level_yellow: y, level_red: r }),
    });
    load();
  }

  const shown = rows.filter(
    (v) =>
      (filter === 'all' || (filter === 'alert' ? ['green', 'yellow', 'red'].includes(v.status) : v.status === filter)) &&
      `${v.product_name} ${v.color} ${v.category}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <h1>Stok</h1>
      <div className="card">
        <div className="row">
          <div><label>Cari</label><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nama produk / warna" /></div>
          <div>
            <label>Tampilkan</label>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Semua</option>
              <option value="alert">Perlu restok</option>
              <option value="red">Kritis</option>
              <option value="yellow">Waspada</option>
            </select>
          </div>
        </div>
        {msg && <div className="alert ok">{msg}</div>}
        <table>
          <thead><tr><th>Kategori</th><th>Produk</th><th>Warna</th><th className="r">Stok</th><th>Level (H/K/M)</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {shown.map((v) => (
              <tr key={v.id}>
                <td>{v.category}</td>
                <td>{v.product_name}</td>
                <td>{v.color || '-'}</td>
                <td className="r">{num(v.stock)} {v.base_unit}</td>
                <td>{v.level_green}/{v.level_yellow}/{v.level_red}</td>
                <td><span className={`badge ${v.status}`}>{LABEL[v.status]}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="secondary" onClick={() => adjust(v)}>Ubah stok</button>{' '}
                  <button className="secondary" onClick={() => levels(v)}>Level</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
