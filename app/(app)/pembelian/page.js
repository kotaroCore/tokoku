'use client';
import { useEffect, useMemo, useState } from 'react';
import { rp, num } from '@/lib/format';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const METHOD = { cash: 'Cash', ewallet: 'E-wallet', transfer: 'Transfer' };

// Kecilkan foto nota (maks. 1600 px, JPEG) supaya cepat diunggah dari HP.
function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('gagal'))), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Foto tidak bisa dibaca')); };
    img.src = url;
  });
}

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
  const [photo, setPhoto] = useState(null); // Blob foto nota
  const [photoUrl, setPhotoUrl] = useState('');

  const [pending, setPending] = useState([]);
  const loadPending = () => fetch('/api/purchases?pending=1').then((r) => r.json()).then(setPending);
  const reloadAll = () => {
    fetch('/api/products').then((x) => x.json()).then(setProducts);
    loadPending(); loadList();
  };
  const loadList = () => fetch(`/api/purchases?date=${date}`).then((r) => r.json()).then(setList);
  useEffect(() => {
    fetch('/api/products').then((r) => r.json()).then(setProducts);
    fetch('/api/suppliers').then((r) => r.json()).then(setSuppliers);
  }, []);
  useEffect(() => { loadList(); }, [date]);
  useEffect(() => { loadPending(); }, []);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const words = t.split(/\s+/);
    return products
      .filter((p) => p.active && p.variants.some((v) => v.active) && words.every((w) => `${p.name} ${p.category}`.toLowerCase().includes(w)))
      .slice(0, 12);
  }, [q, products]);

  const costFor = (p, unit) => (p.cost > 0 ? String(Math.round(p.cost * unit.factor)) : '');

  function add(p) {
    const unit = p.units[0];
    setCart((c) => [...c, { key: `${p.id}-${Date.now()}`, p, unitId: String(unit.id), qty: '1', cost: costFor(p, unit) }]);
    setQ('');
  }
  const upd = (key, patch) => setCart((c) => c.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const unitOf = (l) => l.p.units.find((u) => String(u.id) === l.unitId);
  const sub = (l) => Math.round((Number(l.qty) || 0) * (Number(l.cost) || 0));
  const total = cart.reduce((s, l) => s + sub(l), 0);

  async function pickPhoto(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr('');
    try {
      const b = await shrink(f);
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhoto(b); setPhotoUrl(URL.createObjectURL(b));
    } catch (x) { setErr(x.message || 'Foto tidak bisa dibaca'); }
  }
  function clearPhoto() {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhoto(null); setPhotoUrl('');
  }

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
        items: cart.map((l) => ({ product_id: l.p.id, unit_id: Number(l.unitId), qty: Number(l.qty), unit_cost: Number(l.cost) })),
      }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error);
    let photoMsg = '';
    if (photo) {
      const up = await fetch(`/api/purchases/${d.id}/receipt`, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: photo });
      if (!up.ok) photoMsg = ' Foto nota GAGAL diunggah — pembelian tetap tersimpan.';
    }
    setMsg(`Pembelian #${d.id} tersimpan (${rp(d.total)}). Stok belum bertambah: masukkan ke rak per warna di bagian "Menunggu masuk rak".${photoMsg}`);
    setCart([]); setNote(''); clearPhoto();
    loadPending();
    if (date === today()) loadList(); else setDate(today());
  }

  return (
    <>
      <h1>Pembelian / barang masuk</h1>
      <form className="card" onSubmit={submit}>
        <div className="field" style={{ position: 'relative' }}>
          <label>Cari produk yang dikulak (ketik min. 2 huruf), warna diisi nanti saat barang masuk rak</label>
          <input placeholder="mis. benang jahit yamalaon kecil" value={q} onChange={(e) => setQ(e.target.value)} />
          {matches.length > 0 && (
            <div className="card" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, margin: 0, maxHeight: 280, overflow: 'auto' }}>
              {matches.map((p) => (
                <div key={p.id} style={{ padding: '6px 0', cursor: 'pointer' }} onClick={() => add(p)}>
                  <span className="muted">{p.category}</span> {p.name}
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
                    <td>{l.p.name}<div className="muted">= {num((Number(l.qty) || 0) * unit.factor)} {l.p.base_unit}</div></td>
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
        <div className="field">
          <label>Foto nota / bukti pembelian (boleh kosong)</label>
          <input type="file" accept="image/*" onChange={pickPhoto} />
          {photoUrl && (
            <div style={{ marginTop: 6 }}>
              <img src={photoUrl} alt="Foto nota" style={{ maxWidth: 200, maxHeight: 200, borderRadius: 6 }} />
              <div><button type="button" className="secondary" onClick={clearPhoto}>Hapus foto</button></div>
            </div>
          )}
        </div>
        <h2>Total {rp(total)}</h2>
        {err && <div className="alert err">{err}</div>}
        {msg && <div className="alert ok">{msg}</div>}
        <button disabled={busy || !cart.length}>{busy ? 'Menyimpan…' : 'Simpan pembelian (langsung lunas)'}</button>
      </form>

      <div className="card">
        <h2>Menunggu masuk rak</h2>
        {pending.map((p) => (
          <div key={p.id} style={{ marginBottom: 14 }}>
            <strong>#{p.id}</strong> • {p.created_at.slice(0, 10)} • {p.supplier_name || 'tanpa supplier'}
            {p.note && <span className="muted"> • {p.note}</span>}
            {p.items.filter((i) => i.shelved < i.qty * i.factor - 1e-6).map((i) => (
              <Shelve key={i.id} purchase={p} item={i} product={products.find((x) => x.id === i.product_id)} onDone={reloadAll} />
            ))}
          </div>
        ))}
        {pending.length === 0 && <div className="muted">Semua barang sudah masuk rak.</div>}
      </div>

      <div className="card row">
        <div><label>Riwayat pembelian tanggal</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <div className="card">
        {list.map((p) => (
          <div key={p.id} style={{ marginBottom: 12 }}>
            <strong>#{p.id}</strong> • {p.created_at.slice(11, 16)} • {p.supplier_name || 'tanpa supplier'} • {METHOD[p.pay_method]} • <strong>{rp(p.total)}</strong>
            <span className="muted"> • {p.kasir}{p.note && ` • ${p.note}`}</span>
            {p.receipt_file && (
              <> • <a href={`/api/purchases/${p.id}/receipt`} target="_blank" rel="noreferrer">📎 Lihat foto nota</a></>
            )}
            {p.items.map((i) => (
              <div key={i.id} className="muted" style={{ paddingLeft: 14 }}>
                {i.product_name}{i.color && ` — ${i.color}`}: {num(i.qty)} {i.unit_name} × {rp(i.unit_cost)} = {rp(i.subtotal)}
                {i.product_id && <> • {i.shelved >= i.qty * i.factor - 1e-6 ? 'sudah masuk rak' : `dirak ${num(i.shelved / i.factor)} dari ${num(i.qty)} ${i.unit_name}`}</>}
              </div>
            ))}
          </div>
        ))}
        {list.length === 0 && <div className="muted">Tidak ada pembelian pada tanggal ini.</div>}
      </div>
    </>
  );
}

// Bagi barang dari satu baris nota ke warna-warna produknya; stok tiap warna bertambah.
function Shelve({ purchase, item, product, onDone }) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const left = item.qty - item.shelved / item.factor; // dalam satuan nota
  const sum = Object.values(vals).reduce((s, x) => s + (Number(x) || 0), 0);

  async function save() {
    setErr('');
    const lines = Object.entries(vals).filter(([, x]) => Number(x) > 0).map(([id, x]) => ({ variant_id: Number(id), qty: Number(x) }));
    if (!lines.length) return setErr('Isi jumlah minimal satu warna');
    setBusy(true);
    const r = await fetch(`/api/purchases/${purchase.id}/shelve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: item.id, lines }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error);
    setOpen(false); setVals({});
    onDone();
  }

  return (
    <div style={{ paddingLeft: 14, marginTop: 6 }}>
      {item.product_name}: {num(item.qty)} {item.unit_name} di nota, <strong>sisa {num(left)} {item.unit_name}</strong> belum dirak{' '}
      <button type="button" className="secondary" onClick={() => setOpen(!open)}>{open ? 'Tutup' : 'Masuk rak'}</button>
      {open && product && (
        <div style={{ marginTop: 6 }}>
          <table>
            <thead><tr><th>Warna</th><th>Stok kini</th><th>Masuk ({item.unit_name})</th></tr></thead>
            <tbody>
              {product.variants.filter((v) => v.active).map((v) => (
                <tr key={v.id}>
                  <td>{v.color || '(tanpa warna)'}</td>
                  <td>{num(v.stock)} {product.base_unit}</td>
                  <td><input inputMode="decimal" style={{ width: 80 }} value={vals[v.id] || ''} onChange={(e) => setVals({ ...vals, [v.id]: e.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted">Dibagi {num(sum)} dari sisa {num(left)} {item.unit_name} (= {num(sum * item.factor)} {product.base_unit})</div>
          {err && <div className="alert err">{err}</div>}
          <button type="button" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan, tambah stok'}</button>
        </div>
      )}
    </div>
  );
}
