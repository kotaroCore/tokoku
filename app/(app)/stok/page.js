'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { num } from '@/lib/format';
import { boleh } from '@/lib/izin';
import { useMe } from '../me';

const LABEL = { ok: 'Aman', green: 'Mulai menipis', yellow: 'Waspada', red: 'Kritis', none: 'Tanpa level' };

export default function Stok() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [msg, setMsg] = useState('');
  const bolehBuang = boleh(useMe(), 'buang_rusak');

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

  // Buang barang rusak: jumlah dan alasan wajib. Nilainya masuk laporan sebagai kerugian.
  async function buang(v) {
    const input = prompt(`Buang barang rusak ${v.product_name} ${v.color} (stok rusak ${num(v.stok_rusak)} ${v.base_unit}). Jumlah (${v.base_unit}):`);
    if (input == null || !(Number(input) > 0)) return;
    const alasan = prompt('Alasan dibuang (wajib):');
    if (!alasan || !alasan.trim()) return setMsg('Alasan wajib diisi.');
    const r = await fetch('/api/rusak', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant_id: v.id, qty: Number(input), alasan }),
    });
    const d = await r.json();
    setMsg(r.ok ? `Dibuang ${num(Number(input))} ${v.base_unit}, kerugian Rp ${Math.round(d.nilai).toLocaleString('id-ID')}.` : d.error);
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
      (filter === 'all' || (filter === 'rusak' ? v.stok_rusak > 0 : filter === 'alert' ? ['green', 'yellow', 'red'].includes(v.status) : v.status === filter)) &&
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
              <option value="rusak">Ada stok rusak</option>
            </select>
          </div>
        </div>
        <p className="muted">Stok rusak bisa dijual dari kasir (pilih "jual barang rusak"), dibuang{bolehBuang ? '' : ' (admin atau staf berizin)'}, atau dikembalikan ke supplier di halaman <Link href="/supplier">Supplier</Link>.</p>
        {msg && <div className="alert ok">{msg}</div>}
        <table>
          <thead><tr><th>Kategori</th><th>Produk</th><th>Warna</th><th className="r">Stok</th><th>Level (H/K/M)</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {shown.map((v) => (
              <tr key={v.id}>
                <td>{v.category}</td>
                <td>{v.product_name}</td>
                <td>{v.color || '-'}</td>
                <td className="r">{num(v.stock)} {v.base_unit}{v.stok_rusak > 0 && <div className="muted">rusak {num(v.stok_rusak)}</div>}</td>
                <td>{v.level_green}/{v.level_yellow}/{v.level_red}</td>
                <td><span className={`badge ${v.status}`}>{LABEL[v.status]}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="secondary" onClick={() => adjust(v)}>Ubah stok</button>{' '}
                  <button className="secondary" onClick={() => levels(v)}>Level</button>
                  {v.stok_rusak > 0 && bolehBuang && <>{' '}<button className="secondary" onClick={() => buang(v)}>Buang</button></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
