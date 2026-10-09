'use client';
import { useEffect, useMemo, useState } from 'react';
import { rp, num } from '@/lib/format';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const METHOD = { cash: 'Cash', ewallet: 'E-wallet', transfer: 'Transfer' };

export default function Pembelian() {
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [date, setDate] = useState(today());
  const [list, setList] = useState([]);

  const [q, setQ] = useState('');
  const [cart, setCart] = useState([]); // { key, variant, product, unitId, qty, cost }
  const [supplierId, setSupplierId] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const loadList = () => fetch(`/api/purchases?date=${date}`).then((r) => r.json()).then(setList);
  useEffect(() => {
    fetch('/api/products').then((r) => r.json()).then(setProducts);
    fetch('/api/suppliers').then((r) => r.json()).then(setSuppliers);
  }, []);
  useEffect(() => { loadList(); }, [date]);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const out = [];
    for (const p of products) {
      for (const v of p.variants) {
        if (`${p.name} ${v.color} ${p.category}`.toLowerCase().includes(t)) out.push({ p, v });
        if (out.length >= 12) return out;
      }
    }
    return out;
  }, [q, products]);

  const costFor = (p, unit) => (p.cost > 0 ? String(Math.round(p.cost * unit.factor)) : '');

  function add({ p, v }) {
    const unit = p.units[0];
    setCart((c) => [...c, { key: `${v.id}-${Date.now()}`, p, v, unitId: String(unit.id), qty: '1', cost: costFor(p, unit) }]);
    setQ('');
  }
  const upd = (key, patch) => setCart((c) => c.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const unitOf = (l) => l.p.units.find((u) => String(u.id) === l.unitId);
  const sub = (l) => Math.round((Number(l.qty) || 0) * (Number(l.cost) || 0));
  const total = cart.reduce((s, l) => s + sub(l), 0);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setMsg('');
    if (!cart.length) return setErr('Belum ada barang');
    if (cart.some((l) => !(Number(l.qty) > 0) || l.cost === '' || Number(l.cost) < 0)) return setErr('Isi jumlah dan harga beli semua barang');
    setBusy(true);
    const r = await fetch('/api/purchases', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId || null, pay_method: method, note,
        items: cart.map((l) => ({ variant_id: l.v.id, unit_id: Number(l.unitId), qty: Number(l.qty), unit_cost: Number(l.cost) })),
      }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error);
    setMsg(`Pembelian #${d.id} tersimpan (${rp(d.total)}). Stok sudah bertambah.`);
    setCart([]); setNote('');
    fetch('/api/products').then((x) => x.json()).then(setProducts);
    if (date === today()) loadList(); else setDate(today());
  }

  return (
    <>
      <h1>Pembelian / barang masuk</h1>
      <form className="card" onSubmit={submit}>
        <div className="field" style={{ position: 'relative' }}>
          <label>Cari barang (ketik min. 2 huruf: nama, warna, atau kategori)</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} />
          {matches.length > 0 && (
            <div className="card" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, margin: 0, maxHeight: 280, overflow: 'auto' }}>
              {matches.map((m) => (
                <div key={m.v.id} style={{ padding: '6px 0', cursor: 'pointer' }} onClick={() => add(m)}>
                  <span className="muted">{m.p.category}</span> {m.p.name}{m.v.color && ` — ${m.v.color}`} <span className="muted">(stok {num(m.v.stock)} {m.p.base_unit})</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <table>
            <thead><tr><th>Barang</th><th>Satuan</th><th>Jumlah</th><th>Harga beli / satuan</th><th className="r">Subtotal</th><th></th></tr></thead>
            <tbody>
              {cart.map((l) => {
                const unit = unitOf(l);
                const modal = l.p.cost > 0 ? l.p.cost * unit.factor : 0;
                const diff = modal > 0 && l.cost !== '' && Math.round(Number(l.cost)) !== Math.round(modal);
                return (
                  <tr key={l.key}>
                    <td>{l.p.name}{l.v.color && ` — ${l.v.color}`}<div className="muted">tambah {num((Number(l.qty) || 0) * unit.factor)} {l.p.base_unit}</div></td>
                    <td>
                      <select value={l.unitId} onChange={(e) => {
                        const u = l.p.units.find((x) => String(x.id) === e.target.value);
                        upd(l.key, { unitId: e.target.value, cost: l.cost === '' || l.cost === costFor(l.p, unit) ? costFor(l.p, u) : l.cost });
                      }}>
                        {l.p.units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.factor !== 1 && ` (${num(u.factor)})`}</option>)}
                      </select>
                    </td>
                    <td><input inputMode="decimal" style={{ width: 80 }} value={l.qty} onChange={(e) => upd(l.key, { qty: e.target.value })} /></td>
                    <td>
                      <input inputMode="numeric" style={{ width: 110 }} value={l.cost} onChange={(e) => upd(l.key, { cost: e.target.value })} />
                      {diff && <div className="muted">modal produk {rp(modal)} — ubah manual di Produk bila harga naik/turun</div>}
                    </td>
                    <td className="r">{rp(sub(l))}</td>
                    <td><button type="button" className="secondary" onClick={() => setCart(cart.filter((x) => x.key !== l.key))}>Hapus</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="row" style={{ marginTop: 10 }}>
          <div className="field"><label>Supplier (boleh kosong)</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— tanpa supplier —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Dibayar lewat</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="field"><label>Catatan / no. nota supplier</label><input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <h2>Total {rp(total)}</h2>
        {err && <div className="alert err">{err}</div>}
        {msg && <div className="alert ok">{msg}</div>}
        <button disabled={busy || !cart.length}>{busy ? 'Menyimpan…' : 'Simpan pembelian (langsung lunas)'}</button>
      </form>

      <div className="card row">
        <div><label>Riwayat pembelian tanggal</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <div className="card">
        {list.map((p) => (
          <div key={p.id} style={{ marginBottom: 12 }}>
            <strong>#{p.id}</strong> • {p.created_at.slice(11, 16)} • {p.supplier_name || 'tanpa supplier'} • {METHOD[p.pay_method]} • <strong>{rp(p.total)}</strong>
            <span className="muted"> • {p.kasir}{p.note && ` • ${p.note}`}</span>
            {p.items.map((i) => (
              <div key={i.id} className="muted" style={{ paddingLeft: 14 }}>
                {i.product_name}{i.color && ` — ${i.color}`}: {num(i.qty)} {i.unit_name} × {rp(i.unit_cost)} = {rp(i.subtotal)}
              </div>
            ))}
          </div>
        ))}
        {list.length === 0 && <div className="muted">Tidak ada pembelian pada tanggal ini.</div>}
      </div>
    </>
  );
}
