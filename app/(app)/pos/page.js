'use client';
import { useEffect, useMemo, useState } from 'react';
import { rp, num } from '@/lib/format';
import { autoDiscount } from '@/lib/discount';

const post = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export default function POS() {
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null); // { product, variant }
  const [unitId, setUnitId] = useState('');
  const [qty, setQty] = useState('1');
  const [disc, setDisc] = useState('0');
  const [discTouched, setDiscTouched] = useState(false);
  const [cart, setCart] = useState([]);

  const [channel, setChannel] = useState('retail');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddr, setCustAddr] = useState('');
  const [suggest, setSuggest] = useState([]);
  const [known, setKnown] = useState(null);
  const [cash, setCash] = useState('');
  const [ewallet, setEwallet] = useState('');
  const [transfer, setTransfer] = useState('');
  const [payDebt, setPayDebt] = useState('');

  const [err, setErr] = useState('');
  const [nota, setNota] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadProducts = () => fetch('/api/products').then((r) => r.json()).then(setProducts);
  useEffect(() => { loadProducts(); }, []);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const out = [];
    for (const p of products) {
      for (const v of p.variants) {
        if (`${p.name} ${v.color} ${p.category}`.toLowerCase().includes(term)) out.push({ p, v });
        if (out.length >= 12) return out;
      }
    }
    return out;
  }, [q, products]);

  const unit = sel?.product.units.find((u) => String(u.id) === String(unitId));

  // Saran diskon otomatis, kecuali kasir sudah mengubahnya manual.
  useEffect(() => {
    if (!sel || !unit || discTouched) return;
    setDisc(String(autoDiscount(sel.product.category, unit.name, Number(qty) || 0, unit.factor)));
  }, [sel, unit, qty, discTouched]);

  function pick(m) {
    setSel({ product: m.p, variant: m.v });
    setUnitId(String(m.p.units[0]?.id ?? ''));
    setQty('1');
    setDisc('0');
    setDiscTouched(false);
    setQ('');
  }

  function addToCart() {
    setErr('');
    const n = Number(String(qty).replace(',', '.'));
    if (!sel || !unit || !(n > 0)) return setErr('Pilih produk, satuan, dan jumlah yang benar.');
    const inCart = cart
      .filter((c) => c.variant.id === sel.variant.id)
      .reduce((s, c) => s + c.qty * c.unit.factor, 0);
    if (inCart + n * unit.factor > sel.variant.stock + 1e-9) {
      return setErr(`Stok tidak cukup. Sisa ${num(sel.variant.stock - inCart)} ${sel.product.base_unit}.`);
    }
    const d = Math.min(100, Math.max(0, Number(disc) || 0));
    setCart([...cart, { product: sel.product, variant: sel.variant, unit, qty: n, disc: d }]);
    setSel(null);
  }

  const lineTotal = (c) => Math.round(c.qty * c.unit.price * (1 - c.disc / 100));
  const total = cart.reduce((s, c) => s + lineTotal(c), 0);
  const paid = (Number(cash) || 0) + (Number(ewallet) || 0) + (Number(transfer) || 0);
  const oldPay = Number(payDebt) || 0;
  const hutangBaru = Math.max(0, total - Math.max(0, paid - oldPay));
  const kembalian = Math.max(0, paid - oldPay - total);

  async function onName(v) {
    setCustName(v);
    setKnown(null);
    if (v.trim().length < 2) return setSuggest([]);
    const r = await fetch(`/api/customers?q=${encodeURIComponent(v.trim())}`);
    const rows = await r.json();
    setSuggest(rows);
    const exact = rows.find((c) => c.name.toLowerCase() === v.trim().toLowerCase());
    if (exact) chooseCustomer(exact, false);
  }

  function chooseCustomer(c, closeList = true) {
    setCustName(c.name);
    setCustPhone(c.phone || '');
    setCustAddr(c.address || '');
    setKnown(c);
    if (closeList) setSuggest([]);
  }

  async function checkout() {
    setErr('');
    setBusy(true);
    const r = await post('/api/sales', {
      channel,
      items: cart.map((c) => ({ variant_id: c.variant.id, unit_id: c.unit.id, qty: c.qty, discount_pct: c.disc })),
      customer_name: custName,
      customer_phone: custPhone,
      customer_address: custAddr,
      paid_cash: Number(cash) || 0,
      paid_ewallet: Number(ewallet) || 0,
      paid_transfer: Number(transfer) || 0,
      pay_old_debt: oldPay,
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error);
    const n = await fetch(`/api/sales?id=${d.saleId}`).then((x) => x.json());
    setNota({ ...n, sisaHutang: d.sisaHutang });
    setCart([]);
    setCash(''); setEwallet(''); setTransfer(''); setPayDebt('');
    setCustName(''); setCustPhone(''); setCustAddr(''); setKnown(null);
    loadProducts();
  }

  if (nota) return <Nota nota={nota} onClose={() => setNota(null)} />;

  return (
    <>
      <h1>Kasir</h1>
      <div className="grid cols2">
        <div>
          <div className="card">
            <h2>1. Tambah item</h2>
            <div className="field">
              <label>Cari produk / warna</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="mis. benang yamalaon hitam" autoFocus />
              {matches.length > 0 && (
                <div className="suggest">
                  {matches.map((m) => (
                    <div key={m.v.id} onClick={() => pick(m)}>
                      {m.p.name} {m.v.color && `— ${m.v.color}`} <span className="muted">(stok {num(m.v.stock)} {m.p.base_unit})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {sel && (
              <>
                <p><strong>{sel.product.name}</strong> {sel.variant.color && `— ${sel.variant.color}`} <span className="muted">stok {num(sel.variant.stock)} {sel.product.base_unit}</span></p>
                <div className="row">
                  <div>
                    <label>Satuan</label>
                    <select value={unitId} onChange={(e) => { setUnitId(e.target.value); setDiscTouched(false); }}>
                      {sel.product.units.map((u) => <option key={u.id} value={u.id}>{u.name} — {rp(u.price)}</option>)}
                    </select>
                  </div>
                  <div><label>Jumlah</label><input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
                  <div><label>Diskon %</label><input inputMode="decimal" value={disc} onChange={(e) => { setDisc(e.target.value); setDiscTouched(true); }} /></div>
                </div>
                <p className="muted">
                  Subtotal: {unit ? rp((Number(String(qty).replace(',', '.')) || 0) * unit.price * (1 - (Number(disc) || 0) / 100)) : '-'}
                </p>
                <button onClick={addToCart}>Tambah ke keranjang</button>{' '}
                <button className="secondary" onClick={() => setSel(null)}>Batal</button>
              </>
            )}
            {err && <div className="alert err">{err}</div>}
          </div>

          <div className="card">
            <h2>Keranjang</h2>
            {cart.length === 0 ? <p className="muted">Belum ada item.</p> : (
              <table>
                <thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Subtotal</th><th></th></tr></thead>
                <tbody>
                  {cart.map((c, i) => (
                    <tr key={i}>
                      <td>{c.product.name} {c.variant.color && `(${c.variant.color})`}{c.disc > 0 && <span className="muted"> diskon {c.disc}%</span>}</td>
                      <td className="r">{num(c.qty)} {c.unit.name}</td>
                      <td className="r">{rp(lineTotal(c))}</td>
                      <td><button className="secondary" onClick={() => setCart(cart.filter((_, j) => j !== i))}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <h2 style={{ marginTop: 10 }}>Total: {rp(total)}</h2>
          </div>
        </div>

        <div className="card">
          <h2>2. Pembeli &amp; pembayaran</h2>
          <div className="field">
            <label>Channel</label>
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="retail">Retail</option>
              <option value="wholesale">Grosir</option>
            </select>
          </div>
          <div className="field">
            <label>Nama pembeli (spesifik, wajib bila hutang / bayar hutang)</label>
            <input value={custName} onChange={(e) => onName(e.target.value)} placeholder="mis. Andi Baki anak pak lurah" />
            {suggest.length > 0 && !known && (
              <div className="suggest">
                {suggest.map((c) => (
                  <div key={c.id} onClick={() => chooseCustomer(c)}>
                    {c.name} {c.total_hutang > 0 && <span className="muted">— hutang {rp(c.total_hutang)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          {known && known.total_hutang > 0 && (
            <div className="alert">
              ⚠️ Pembeli ini masih punya hutang <strong>{rp(known.total_hutang)}</strong>
              {known.last_hutang_date && ` per ${known.last_hutang_date}`}.
              <div style={{ marginTop: 6 }}>
                <button className="secondary" onClick={() => setPayDebt(String(known.total_hutang))}>Bayar lunas sekarang</button>
              </div>
            </div>
          )}
          <div className="row">
            <div className="field"><label>No. WhatsApp (opsional)</label><input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} /></div>
            <div className="field"><label>Alamat / keterangan</label><input value={custAddr} onChange={(e) => setCustAddr(e.target.value)} /></div>
          </div>
          <div className="row">
            <div className="field"><label>Cash</label><input inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value)} /></div>
            <div className="field"><label>E-wallet</label><input inputMode="numeric" value={ewallet} onChange={(e) => setEwallet(e.target.value)} /></div>
            <div className="field"><label>Transfer</label><input inputMode="numeric" value={transfer} onChange={(e) => setTransfer(e.target.value)} /></div>
          </div>
          {known && known.total_hutang > 0 && (
            <div className="field">
              <label>Dari uang masuk, bayar hutang lama</label>
              <input inputMode="numeric" value={payDebt} onChange={(e) => setPayDebt(e.target.value)} />
            </div>
          )}
          <table>
            <tbody>
              <tr><td>Total belanja</td><td className="r">{rp(total)}</td></tr>
              <tr><td>Uang masuk</td><td className="r">{rp(paid)}</td></tr>
              {oldPay > 0 && <tr><td>Untuk hutang lama</td><td className="r">{rp(oldPay)}</td></tr>}
              <tr><td>Hutang baru</td><td className="r"><strong>{rp(hutangBaru)}</strong></td></tr>
              <tr><td>Kembalian</td><td className="r">{rp(kembalian)}</td></tr>
            </tbody>
          </table>
          {err && <div className="alert err">{err}</div>}
          <button disabled={busy || cart.length === 0} onClick={checkout} style={{ marginTop: 10, width: '100%' }}>
            Selesaikan transaksi
          </button>
        </div>
      </div>
    </>
  );
}

function Nota({ nota, onClose }) {
  return (
    <>
      <div className="card nota">
        <h2>Toko — Nota #{nota.id}</h2>
        <div className="muted">{nota.created_at} • kasir {nota.kasir}{nota.customer_name && ` • ${nota.customer_name}`}</div>
        <hr />
        {nota.items.map((i) => (
          <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>{i.product_name} {num(i.qty)} {i.unit_name}{i.discount_pct > 0 && ` (-${i.discount_pct}%)`}</span>
            <span>{rp(i.subtotal)}</span>
          </div>
        ))}
        <hr />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>Total</strong><strong>{rp(nota.total)}</strong></div>
        {nota.paid_cash > 0 && <div>Cash: {rp(nota.paid_cash)}</div>}
        {nota.paid_ewallet > 0 && <div>E-wallet: {rp(nota.paid_ewallet)}</div>}
        {nota.paid_transfer > 0 && <div>Transfer: {rp(nota.paid_transfer)}</div>}
        {nota.sisaHutang > 0 && (
          <p><strong>⚠️ MASIH ADA HUTANG: {rp(nota.sisaHutang)}</strong>{nota.last_hutang_date && ` (sejak ${nota.last_hutang_date})`}</p>
        )}
      </div>
      <div className="noprint">
        <button onClick={() => window.print()}>Cetak nota</button>{' '}
        <button className="secondary" onClick={onClose}>Transaksi baru</button>
      </div>
    </>
  );
}
