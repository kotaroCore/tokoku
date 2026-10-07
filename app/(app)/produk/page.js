'use client';
import { useEffect, useState } from 'react';
import { rp, num } from '@/lib/format';

const CATS = ['BENANG', 'FURING', 'RESLETING', 'BENIK', 'KAIN'];
const blankUnit = { name: 'biji', factor: '1', price: '' };

export default function Produk() {
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ category: 'BENANG', name: '', base_unit: 'biji', units: [{ ...blankUnit }], colors: '' });
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  const load = () => fetch('/api/products').then((r) => r.json()).then(setProducts);
  useEffect(() => { load(); }, []);

  const setUnit = (i, k, v) => setF({ ...f, units: f.units.map((u, j) => (j === i ? { ...u, [k]: v } : u)) });

  async function save(e) {
    e.preventDefault();
    setErr('');
    const variants = f.colors.split(',').map((c) => c.trim()).filter(Boolean).map((color) => ({ color }));
    const r = await fetch('/api/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: f.category, name: f.name, base_unit: f.base_unit, units: f.units, variants }),
    });
    const d = await r.json();
    if (!r.ok) return setErr(d.error);
    setOpen(false);
    setF({ category: 'BENANG', name: '', base_unit: 'biji', units: [{ ...blankUnit }], colors: '' });
    load();
  }

  async function addVariant(p) {
    const color = prompt(`Tambah warna/varian untuk ${p.name}:`);
    if (!color?.trim()) return;
    await fetch('/api/variants', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: p.id, color }),
    });
    load();
  }

  const shown = products.filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <h1>Produk</h1>
      <div className="card row">
        <div><label>Cari</label><input value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div><button onClick={() => setOpen(!open)}>{open ? 'Tutup' : '+ Produk baru'}</button></div>
      </div>

      {open && (
        <form className="card" onSubmit={save}>
          <h2>Produk baru</h2>
          <div className="row">
            <div className="field"><label>Kategori</label>
              <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                {CATS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field"><label>Nama produk</label><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="field"><label>Satuan dasar stok (biji / meter / buah)</label><input required value={f.base_unit} onChange={(e) => setF({ ...f, base_unit: e.target.value })} /></div>
          </div>
          <h2>Satuan jual</h2>
          <p className="muted">Faktor = jumlah satuan dasar per satuan jual (dosin = 12, gross = 144, meter = 1).</p>
          {f.units.map((u, i) => (
            <div className="row" key={i}>
              <div className="field"><label>Nama satuan</label><input required value={u.name} onChange={(e) => setUnit(i, 'name', e.target.value)} /></div>
              <div className="field"><label>Faktor</label><input required value={u.factor} onChange={(e) => setUnit(i, 'factor', e.target.value)} /></div>
              <div className="field"><label>Harga</label><input required inputMode="numeric" value={u.price} onChange={(e) => setUnit(i, 'price', e.target.value)} /></div>
            </div>
          ))}
          <button type="button" className="secondary" onClick={() => setF({ ...f, units: [...f.units, { ...blankUnit }] })}>+ Satuan</button>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Warna / varian (pisahkan koma; kosongkan bila tidak ada)</label>
            <input value={f.colors} onChange={(e) => setF({ ...f, colors: e.target.value })} placeholder="Hitam, Putih, 110, 077" />
          </div>
          {err && <div className="alert err">{err}</div>}
          <button>Simpan</button>
        </form>
      )}

      <div className="card">
        <table>
          <thead><tr><th>Produk</th><th>Satuan &amp; harga</th><th>Varian (stok)</th><th></th></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td><span className="muted">{p.category}</span><br />{p.name}</td>
                <td>{p.units.map((u) => <div key={u.id}>{u.name}{u.factor !== 1 && ` (${num(u.factor)} ${p.base_unit})`}: {rp(u.price)}</div>)}</td>
                <td>{p.variants.map((v) => <span key={v.id} style={{ marginRight: 10, whiteSpace: 'nowrap' }}>{v.color || '-'} ({num(v.stock)})</span>)}</td>
                <td><button className="secondary" onClick={() => addVariant(p)}>+ Warna</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
