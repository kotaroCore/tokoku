'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { rp, num } from '@/lib/format';
import { ProductForm, blank, CATS, toForm } from './ProdukForm';
import Modal from '../Modal';

export default function Produk() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [presets, setPresets] = useState(null);
  const [editing, setEditing] = useState(null); // null = tertutup, 'baru', atau id produk yang diubah
  const [q, setQ] = useState('');
  const [showOff, setShowOff] = useState(false);

  const load = () => fetch('/api/products?all=1').then((r) => r.json()).then(setProducts);
  useEffect(() => { load(); fetch('/api/unit-presets').then((r) => r.json()).then(setPresets); }, []);

  const close = () => setEditing(null);
  const cur = typeof editing === 'number' ? products.find((x) => x.id === editing) : null;
  const formInit = editing === 'baru' ? blank(presets || []) : cur ? toForm(cur, presets || []) : null;
  const cats = [...new Set([...CATS, ...products.map((x) => x.category)])];

  async function toggle(p) {
    if (p.active && !confirm(`Nonaktifkan "${p.name}"? Produk tidak muncul di kasir dan stok, riwayat nota tetap aman.`)) return;
    await fetch('/api/products', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, active: !p.active }),
    });
    load();
  }

  const shown = products.filter((p) => (showOff || p.active) && `${p.name} ${p.category}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <h1>Produk</h1>
      <div className="card row">
        <div><label>Cari</label><input value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div><label><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} style={{ width: 'auto' }} /> Tampilkan nonaktif</label></div>
        <div><button onClick={() => setEditing('baru')} disabled={!presets}>+ Produk baru</button></div>
        <div><button className="secondary" onClick={() => router.push('/produk/satuan')}>Pilihan satuan</button></div>
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Produk</th><th>Satuan &amp; harga</th><th>Varian (stok)</th><th></th></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} style={p.active ? undefined : { opacity: 0.5 }}>
                <td><span className="muted">{p.category}{!p.active && ' · NONAKTIF'}</span><br />{p.name}
                  {p.cost > 0 && <div className="muted">modal {rp(p.cost)}/{p.base_unit}</div>}</td>
                <td>{p.units.map((u) => <div key={u.id}>{u.name}{u.factor !== 1 && ` (${num(u.factor)} ${p.base_unit})`}: {rp(u.price)}</div>)}</td>
                <td>{p.variants.filter((v) => v.active).map((v) => <span key={v.id} style={{ marginRight: 10, whiteSpace: 'nowrap' }}>{v.color || '-'} ({num(v.stock)})</span>)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="secondary" onClick={() => setEditing(p.id)}>Ubah</button>{' '}
                  <button className="secondary" onClick={() => toggle(p)}>{p.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing !== null && formInit && (
        <Modal title={editing === 'baru' ? 'Produk baru' : 'Ubah produk'} onClose={close}>
          <ProductForm
            key={String(editing)} inModal init={formInit} cats={cats} presets={presets} variants={cur ? cur.variants : []}
            onChanged={load} onDone={() => { close(); load(); }} onCancel={close}
          />
        </Modal>
      )}
    </>
  );
}
