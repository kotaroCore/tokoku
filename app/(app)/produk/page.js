'use client';
import { useEffect, useMemo, useState } from 'react';
import { rp, num } from '@/lib/format';

const CATS = ['BENANG', 'FURING', 'RESLETING', 'BENIK', 'KAIN'];
// Satuan jual umum: klik untuk mengisi nama + faktor. Paket berbeda-beda per produk, jadi faktornya diisi sendiri.
const PRESETS = [
  { name: 'biji', factor: '1' },
  { name: 'paket', factor: '' },
  { name: 'dosin', factor: '12' },
  { name: 'gross', factor: '144' },
  { name: 'meter', factor: '1' },
];
const blankUnit = () => ({ name: 'biji', factor: '1', price: '' });
const blankVariant = () => ({ color: '', stock: '', level_green: '', level_yellow: '', level_red: '' });
const blank = () => ({ id: null, category: 'BENANG', name: '', base_unit: 'biji', cost: '', units: [blankUnit()], variants: [blankVariant()] });

// Peringatan harga: satuan lebih besar seharusnya tidak lebih mahal per satuan dasar, dan harga jual tidak di bawah modal.
function unitWarnings(f) {
  const rows = f.units
    .map((u) => ({ name: u.name, factor: Number(u.factor), price: Number(u.price), raw: u.price }))
    .filter((u) => u.name && u.factor > 0 && u.raw !== '');
  const w = [];
  const sorted = [...rows].sort((a, b) => a.factor - b.factor);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (b.factor > a.factor && b.price / b.factor > a.price / a.factor) {
      w.push(`"${b.name}" lebih mahal per ${f.base_unit || 'satuan dasar'} (${rp(b.price / b.factor)}) daripada "${a.name}" (${rp(a.price / a.factor)}). Sudah benar?`);
    }
  }
  const cost = Number(f.cost);
  if (cost > 0) for (const u of rows) if (u.price < cost * u.factor) w.push(`Harga "${u.name}" ${rp(u.price)} di bawah modal ${rp(cost * u.factor)}.`);
  return w;
}

function ProductForm({ init, cats, onDone, onCancel }) {
  const [f, setF] = useState(init);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const edit = !!f.id;
  const warns = useMemo(() => unitWarnings(f), [f]);

  const setUnit = (i, k, v) => setF({ ...f, units: f.units.map((u, j) => (j === i ? { ...u, [k]: v } : u)) });
  const setVar = (i, k, v) => setF({ ...f, variants: f.variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });

  async function save(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const body = { id: f.id, category: f.category, name: f.name, base_unit: f.base_unit, cost: f.cost, units: f.units };
    if (!edit) body.variants = f.variants.filter((v) => v.color.trim() || f.variants.length === 1);
    const r = await fetch('/api/products', {
      method: edit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error);
    onDone();
  }

  return (
    <form className="card" onSubmit={save}>
      <h2>{edit ? `Ubah produk: ${init.name}` : 'Produk baru'}</h2>
      <div className="row">
        <div className="field"><label>Kategori (pilih atau ketik baru)</label>
          <input required list="cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="field"><label>Nama produk</label><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      </div>
      <div className="row">
        <div className="field"><label>Satuan dasar stok (biji / meter / buah)</label>
          <input required value={f.base_unit} onChange={(e) => setF({ ...f, base_unit: e.target.value })} /></div>
        <div className="field"><label>Harga beli / modal per {f.base_unit || 'satuan dasar'} (opsional)</label>
          <input inputMode="numeric" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></div>
      </div>

      <h2>Satuan jual &amp; harga</h2>
      <p className="muted">Faktor = jumlah satuan dasar dalam satu satuan jual (dosin = 12, gross = 144). Tiap satuan boleh punya harga sendiri.</p>
      {f.units.map((u, i) => {
        const factor = Number(u.factor), price = Number(u.price);
        const per = factor > 0 && u.price !== '' ? price / factor : null;
        return (
          <div className="unit-row" key={i}>
            <div className="field"><label>Nama satuan</label>
              <input required value={u.name} onChange={(e) => setUnit(i, 'name', e.target.value)} />
              <div style={{ marginTop: 4 }}>
                {PRESETS.map((p) => (
                  <button type="button" key={p.name} className="secondary" style={{ padding: '2px 8px', marginRight: 4, fontSize: 12 }}
                    onClick={() => setF({ ...f, units: f.units.map((x, j) => (j === i ? { ...x, name: p.name, factor: p.factor || x.factor } : x)) })}>{p.name}</button>
                ))}
              </div>
            </div>
            <div className="field"><label>Faktor</label><input required inputMode="decimal" value={u.factor} onChange={(e) => setUnit(i, 'factor', e.target.value)} /></div>
            <div className="field"><label>Harga jual</label>
              <input required inputMode="numeric" value={u.price} onChange={(e) => setUnit(i, 'price', e.target.value)} />
              {per != null && factor !== 1 && <div className="muted">= {rp(per)} per {f.base_unit}</div>}
              {per != null && Number(f.cost) > 0 && <div className="muted">laba {rp(per - Number(f.cost))} per {f.base_unit}</div>}
            </div>
            {f.units.length > 1 && <div className="unit-del"><button type="button" className="secondary" onClick={() => setF({ ...f, units: f.units.filter((_, j) => j !== i) })}>Hapus</button></div>}
          </div>
        );
      })}
      <button type="button" className="secondary" onClick={() => setF({ ...f, units: [...f.units, { name: '', factor: '', price: '' }] })}>+ Satuan</button>
      {warns.map((w, i) => <div key={i} className="alert err" style={{ marginTop: 8 }}>{w}</div>)}

      {!edit && (
        <>
          <h2 style={{ marginTop: 16 }}>Warna / varian &amp; stok awal</h2>
          <p className="muted">Stok dan level dalam satuan dasar ({f.base_unit}). Level: hijau = mulai menipis, kuning = waspada, merah = kritis (hijau &gt; kuning &gt; merah). Kosongkan nama warna bila produk tanpa warna.</p>
          {f.variants.map((v, i) => (
            <div className="row" key={i}>
              <div className="field"><label>Warna / varian</label><input value={v.color} placeholder="Hitam, 110, 077" onChange={(e) => setVar(i, 'color', e.target.value)} /></div>
              <div className="field"><label>Stok awal</label><input inputMode="decimal" value={v.stock} onChange={(e) => setVar(i, 'stock', e.target.value)} /></div>
              <div className="field"><label>Level hijau</label><input inputMode="decimal" value={v.level_green} onChange={(e) => setVar(i, 'level_green', e.target.value)} /></div>
              <div className="field"><label>Kuning</label><input inputMode="decimal" value={v.level_yellow} onChange={(e) => setVar(i, 'level_yellow', e.target.value)} /></div>
              <div className="field"><label>Merah</label><input inputMode="decimal" value={v.level_red} onChange={(e) => setVar(i, 'level_red', e.target.value)} /></div>
              {f.variants.length > 1 && <div><button type="button" className="secondary" onClick={() => setF({ ...f, variants: f.variants.filter((_, j) => j !== i) })}>Hapus</button></div>}
            </div>
          ))}
          <button type="button" className="secondary" onClick={() => setF({ ...f, variants: [...f.variants, blankVariant()] })}>+ Warna</button>
        </>
      )}
      {edit && <p className="muted" style={{ marginTop: 12 }}>Warna, stok, dan level diatur di halaman Stok.</p>}

      {err && <div className="alert err">{err}</div>}
      <div className="row" style={{ marginTop: 12 }}>
        <button disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        <button type="button" className="secondary" onClick={onCancel}>Batal</button>
      </div>
    </form>
  );
}

export default function Produk() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(null); // null = tertutup
  const [q, setQ] = useState('');
  const [showOff, setShowOff] = useState(false);

  const load = () => fetch('/api/products?all=1').then((r) => r.json()).then(setProducts);
  useEffect(() => { load(); }, []);

  const cats = useMemo(() => [...new Set([...CATS, ...products.map((p) => p.category)])], [products]);

  const openEdit = (p) => {
    setForm({
      id: p.id, category: p.category, name: p.name, base_unit: p.base_unit, cost: p.cost ? String(p.cost) : '',
      units: p.units.map((u) => ({ id: u.id, name: u.name, factor: String(u.factor), price: String(u.price) })),
      variants: [],
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  async function toggle(p) {
    if (p.active && !confirm(`Nonaktifkan "${p.name}"? Produk tidak muncul di kasir dan stok, riwayat nota tetap aman.`)) return;
    await fetch('/api/products', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, active: !p.active }),
    });
    load();
  }

  async function addVariant(p) {
    const color = prompt(`Tambah warna/varian untuk ${p.name}:`);
    if (!color?.trim()) return;
    const r = await fetch('/api/variants', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: p.id, color }),
    });
    if (!r.ok) alert((await r.json()).error);
    load();
  }

  const shown = products.filter((p) => (showOff || p.active) && `${p.name} ${p.category}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <h1>Produk</h1>
      <div className="card row">
        <div><label>Cari</label><input value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div><label><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} style={{ width: 'auto' }} /> Tampilkan nonaktif</label></div>
        <div><button onClick={() => setForm(form ? null : blank())}>{form ? 'Tutup' : '+ Produk baru'}</button></div>
      </div>

      {form && <ProductForm key={form.id ?? 'new'} init={form} cats={cats} onCancel={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}

      <div className="card">
        <table>
          <thead><tr><th>Produk</th><th>Satuan &amp; harga</th><th>Varian (stok)</th><th></th></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} style={p.active ? undefined : { opacity: 0.5 }}>
                <td><span className="muted">{p.category}{!p.active && ' · NONAKTIF'}</span><br />{p.name}
                  {p.cost > 0 && <div className="muted">modal {rp(p.cost)}/{p.base_unit}</div>}</td>
                <td>{p.units.map((u) => <div key={u.id}>{u.name}{u.factor !== 1 && ` (${num(u.factor)} ${p.base_unit})`}: {rp(u.price)}</div>)}</td>
                <td>{p.variants.map((v) => <span key={v.id} style={{ marginRight: 10, whiteSpace: 'nowrap' }}>{v.color || '-'} ({num(v.stock)})</span>)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="secondary" onClick={() => openEdit(p)}>Ubah</button>{' '}
                  {p.active && <button className="secondary" onClick={() => addVariant(p)}>+ Warna</button>}{' '}
                  <button className="secondary" onClick={() => toggle(p)}>{p.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
