'use client';
import { useEffect, useMemo, useState } from 'react';
import { setBusy as tandaiTransaksi } from '@/lib/busy';
import { rp, num } from '@/lib/format';
import { autoDiscount } from '@/lib/discount';

const post = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export default function POS() {
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null); // { product }
  const [variantId, setVariantId] = useState(''); // teks bebas; bila cocok dengan warna yang ada, stok warna itu yang dikurangi
  const [unitId, setUnitId] = useState('');
  const [qty, setQty] = useState('1');
  const [disc, setDisc] = useState('0');
  const [discTouched, setDiscTouched] = useState(false);
  const [rusakMode, setRusakMode] = useState(false); // jual dari stok rusak, harga diketik kasir
  const [hargaRusak, setHargaRusak] = useState('');
  const [cart, setCart] = useState([]);

  const [channel, setChannel] = useState('retail');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddr, setCustAddr] = useState('');
  const [suggest, setSuggest] = useState([]);
  const [known, setKnown] = useState(null);
  const [cash, setCash] = useState('');
  const [ewallet, setEwallet] = useState('');
  const [ewalletKet, setEwalletKet] = useState('');
  const [totalBulat, setTotalBulat] = useState(''); // total yang dibulatkan staf (opsional) // keterangan e-wallet: QRIS, GoPay, ShopeePay, atau lainnya
  const [transfer, setTransfer] = useState('');
  const [saldoPakai, setSaldoPakai] = useState(''); // dari saldo titipan pembeli
  const [payDebt, setPayDebt] = useState('');
  const [tempoHari, setTempoHari] = useState(7); // jatuh tempo bawaan dari pengaturan
  const [jatuhTempo, setJatuhTempo] = useState(''); // kosong = bawaan
  const [mirip, setMirip] = useState(null); // { draft, list }: nama pembeli baru mirip pembeli lama

  const [err, setErr] = useState('');
  const [info, setInfo] = useState(''); // pesan sukses, mis. draf tersimpan
  const [nota, setNota] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadProducts = () => fetch('/api/products').then((r) => r.json()).then(setProducts);
  useEffect(() => {
    loadProducts();
    fetch('/api/debts?config=1').then((r) => r.json()).then((d) => setTempoHari(d.tempo_hari));
  }, []);
  // Keranjang terisi = sedang transaksi: logout otomatis ditunda.
  useEffect(() => {
    tandaiTransaksi('pos', cart.length > 0);
    return () => tandaiTransaksi('pos', false);
  }, [cart.length]);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const out = [];
    for (const p of products) {
      if (`${p.name} ${p.category}`.toLowerCase().includes(term)) out.push({ p });
      if (out.length >= 12) return out;
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
    setSel({ product: m.p });
    setVariantId('');
    setUnitId(String(m.p.units[0]?.id ?? ''));
    setQty('1');
    setDisc('0');
    setDiscTouched(false);
    setRusakMode(false);
    setHargaRusak('');
    setQ('');
  }

  function addToCart() {
    setErr('');
    const n = Number(String(qty).replace(',', '.'));
    if (!sel || !unit || !(n > 0)) return setErr('Pilih produk, satuan, dan jumlah yang benar.');
    const used = (id, rusak = false) => cart.filter((c) => c.variant.id === id && !!c.rusak === rusak).reduce((x, c) => x + c.qty * c.unit.factor, 0);
    if (rusakMode) {
      // Barang rusak: warna diambil dari stok rusak terbanyak; nota tetap tanpa warna, baris ditandai (rusak).
      const harga = Math.round(Number(hargaRusak));
      if (hargaRusak === '' || !(harga >= 0)) return setErr('Isi harga barang rusak per satuan (sesuai kesepakatan).');
      let need = n * unit.factor;
      const sisaRusak = (v) => v.stok_rusak - used(v.id, true);
      const total = sel.product.variants.reduce((x, v) => x + Math.max(0, sisaRusak(v)), 0);
      if (need > total + 1e-9) return setErr(`Stok rusak tidak cukup. Sisa ${num(total)} ${sel.product.base_unit}.`);
      const lines = [];
      for (const v of [...sel.product.variants].sort((a, b) => sisaRusak(b) - sisaRusak(a))) {
        if (need <= 1e-9) break;
        const take = Math.min(need, Math.max(0, sisaRusak(v)));
        if (take <= 0) continue;
        lines.push({ product: sel.product, variant: v, unit, qty: take / unit.factor, disc: 0, auto: false, rusak: true, harga });
        need -= take;
      }
      setCart([...cart, ...lines]);
      setSel(null);
      return;
    }
    const free = (v) => v.stock - used(v.id);
    const active = sel.product.variants.filter((v) => v.active);
    const d = Math.min(100, Math.max(0, Number(disc) || 0));
    let need = n * unit.factor;
    const lines = [];
    const typed = variantId.trim().toLowerCase();
    const v = typed && active.find((x) => x.color.trim().toLowerCase() === typed);
    const findColor = (name) => active.find((x) => x.color.trim().toLowerCase() === name.trim().toLowerCase());
    if (v) {
      if (need > free(v) + 1e-9) return setErr(`Stok tidak cukup. Sisa ${num(free(v))} ${sel.product.base_unit}.`);
      lines.push({ v, qty: n });
    } else {
      // Rincian "hitam 2, putih 2": angka = jumlah satuan dasar per warna. Warna tanpa angka / tidak dikenal
      // (mis. "lupa") diabaikan, sisanya diambil otomatis dari warna berstok terbanyak.
      const taken = new Map();
      for (const part of variantId.split(',')) {
        const m = part.trim().match(/^(.*\S)\s+(\d+(?:[.,]\d+)?)$/);
        const cv = m && findColor(m[1]);
        if (!cv) continue;
        taken.set(cv, (taken.get(cv) || 0) + Number(m[2].replace(',', '.')));
      }
      let given = 0;
      for (const [cv, amt] of taken) {
        if (amt > free(cv) + 1e-9) return setErr(`Stok ${cv.color} tidak cukup. Sisa ${num(free(cv))} ${sel.product.base_unit}.`);
        given += amt;
      }
      if (given > need + 1e-9) return setErr(`Rincian warna (${num(given)}) melebihi jumlah (${num(need)} ${sel.product.base_unit}).`);
      for (const [cv, amt] of taken) lines.push({ v: cv, qty: amt / unit.factor });
      need -= given;
      // Otomatis: ambil dari warna berstok terbanyak, sisanya dari warna lain.
      const left = (x) => free(x) - (taken.get(x) || 0);
      const total = active.reduce((x, c) => x + Math.max(0, left(c)), 0);
      if (need > total + 1e-9) return setErr(`Stok tidak cukup. Sisa ${num(total)} ${sel.product.base_unit}.`);
      for (const c of [...active].sort((x, y) => left(y) - left(x))) {
        if (need <= 1e-9) break;
        const take = Math.min(need, Math.max(0, left(c)));
        if (take <= 0) continue;
        lines.push({ v: c, qty: take / unit.factor, auto: true });
        need -= take;
      }
    }
    setCart([...cart, ...lines.map((l) => ({ product: sel.product, variant: l.v, unit, qty: l.qty, disc: d, auto: !!l.auto }))]);
    setSel(null);
  }

  // Sama dengan server: satu produk/satuan/diskon yang terpecah ke beberapa warna dibulatkan sekali, selisih ke baris terakhir.
  const subtotals = (() => {
    const out = [];
    const groups = new Map();
    cart.forEach((c, i) => {
      const key = groupKey(c);
      groups.set(key, [...(groups.get(key) || []), i]);
    });
    for (const idx of groups.values()) {
      const part = (i) => cart[i].qty * priceOf(cart[i]) * (1 - cart[i].disc / 100);
      let rest = Math.round(idx.reduce((s, i) => s + part(i), 0));
      idx.forEach((i, k) => {
        out[i] = k === idx.length - 1 ? rest : Math.round(part(i));
        rest -= out[i];
      });
    }
    return out;
  })();
  const lineTotal = (c) => subtotals[cart.indexOf(c)];
  const total = subtotals.reduce((s, x) => s + x, 0);
  // Keranjang ditampilkan per produk (tanpa warna); pecahan warna hanya urusan stok.
  const cartRows = (() => {
    const groups = new Map();
    cart.forEach((c, i) => {
      const key = groupKey(c);
      if (!groups.has(key)) groups.set(key, { c, idx: [], qty: 0, sub: 0 });
      const g = groups.get(key);
      g.idx.push(i); g.qty += c.qty; g.sub += subtotals[i];
    });
    return [...groups.values()];
  })();
  const paid = (Number(cash) || 0) + (Number(ewallet) || 0) + (Number(transfer) || 0) + (Number(saldoPakai) || 0);
  const oldPay = Number(payDebt) || 0;
  // Pembulatan manual: selisih antara total yang dibulatkan staf dan total barang. Sistem hanya mencatat selisihnya.
  const pembulatan = totalBulat === '' ? 0 : Math.round(Number(totalBulat) || 0) - total;
  const tagihan = total + pembulatan;
  const hutangBaru = Math.max(0, tagihan - Math.max(0, paid - oldPay));
  const kembalian = Math.max(0, paid - oldPay - tagihan);
  const tanggal = (hari) => new Date(Date.now() - new Date().getTimezoneOffset() * 60000 + hari * 86400000).toISOString().slice(0, 10);
  const tempoBawaan = tanggal(tempoHari);

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

  // Titip saldo: pembeli baru dibuat otomatis dari nama di form.
  async function titipSaldo() {
    const input = prompt(`Titip saldo untuk ${custName || 'pembeli'}. Jumlah (Rp):`);
    if (!input) return;
    setErr('');
    const body = { customer_id: known?.id, customer_name: custName, customer_phone: custPhone, customer_address: custAddr, amount: Number(input) };
    let r = await post('/api/saldo', body);
    let d = await r.json();
    if (r.status === 409 && confirm(`${d.error}\n\nMirip: ${d.mirip.map((c) => c.name).join(', ')}\n\nOK = tetap buat pembeli baru. Batal = pilih nama yang sudah ada dulu.`)) {
      r = await post('/api/saldo', { ...body, pembeli_baru: true });
      d = await r.json();
    }
    if (!r.ok) return setErr(d.error);
    setKnown({ ...(known || {}), id: d.customer_id, name: custName, saldo: d.saldo });
    setInfo(`Titipan ${rp(Number(input))} dicatat. Saldo sekarang ${rp(d.saldo)}.`);
  }

  function chooseCustomer(c, closeList = true) {
    setCustName(c.name);
    setCustPhone(c.phone || '');
    setCustAddr(c.address || '');
    setKnown(c);
    if (closeList) setSuggest([]);
  }

  // draft: true = simpan sebagai nota draf (stok belum berkurang, dilunasi lewat Riwayat).
  // pembeliBaru: kasir sudah memilih "tetap buat baru" walau ada nama mirip.
  async function checkout(draft = false, pembeliBaru = false) {
    setErr('');
    setInfo('');
    setMirip(null);
    setBusy(true);
    const r = await post('/api/sales', {
      channel,
      draft,
      items: cart.map((c) => ({ variant_id: c.variant.id, unit_id: c.unit.id, qty: c.qty, auto: c.auto, discount_pct: c.disc, dari_rusak: c.rusak ? 1 : 0, harga: c.rusak ? c.harga : undefined })),
      customer_name: custName,
      customer_phone: custPhone,
      customer_address: custAddr,
      paid_cash: Number(cash) || 0,
      paid_ewallet: Number(ewallet) || 0,
      paid_ewallet_ket: ewalletKet,
      pembulatan,
      paid_transfer: Number(transfer) || 0,
      paid_saldo: Number(saldoPakai) || 0,
      pay_old_debt: oldPay,
      jatuh_tempo: hutangBaru > 0 && jatuhTempo ? jatuhTempo : null,
      pembeli_baru: pembeliBaru,
    });
    const d = await r.json();
    setBusy(false);
    if (r.status === 409) return setMirip({ draft, list: d.mirip });
    if (!r.ok) return setErr(d.error);
    setJatuhTempo('');
    if (draft || d.status === 'draft') {
      setInfo(d.menunggu
        ? `Nota ${d.nomor} disimpan. Menunggu konfirmasi dana e-wallet / transfer; konfirmasi lewat Riwayat sebelum barang diserahkan.`
        : `Draf ${d.nomor} disimpan. Stok belum berkurang; lunasi lewat Riwayat.`);
      setCart([]);
      setCash(''); setEwallet(''); setEwalletKet(''); setTransfer(''); setSaldoPakai(''); setPayDebt(''); setTotalBulat('');
      setCustName(''); setCustPhone(''); setCustAddr(''); setKnown(null);
      return loadProducts();
    }
    const n = await fetch(`/api/sales?id=${d.saleId}`).then((x) => x.json());
    setNota({ ...n, sisaHutang: d.sisaHutang });
    setCart([]);
    setCash(''); setEwallet(''); setEwalletKet(''); setTransfer(''); setSaldoPakai(''); setPayDebt(''); setTotalBulat('');
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
              <label>Cari produk</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="mis. benang yamalaon hitam" autoFocus />
              {matches.length > 0 && (
                <div className="suggest">
                  {matches.map((m) => (
                    <div key={m.p.id} onClick={() => pick(m)}>
                      {m.p.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {sel && (
              <>
                <p><strong>{sel.product.name}</strong></p>
                <div className="row">
                  <div>
                    <label>Satuan</label>
                    <select value={unitId} onChange={(e) => { setUnitId(e.target.value); setDiscTouched(false); }}>
                      {sel.product.units.map((u) => <option key={u.id} value={u.id}>{u.name} — {rp(u.price)}</option>)}
                    </select>
                  </div>
                  <div><label>Jumlah</label><input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
                  {rusakMode
                    ? <div><label>Harga rusak / {unit?.name || 'satuan'}</label><input inputMode="numeric" value={hargaRusak} onChange={(e) => setHargaRusak(e.target.value)} placeholder={unit ? String(unit.price) : ''} /></div>
                    : <div><label>Diskon %</label><input inputMode="decimal" value={disc} onChange={(e) => { setDisc(e.target.value); setDiscTouched(true); }} /></div>}
                </div>
                {sel.product.variants.some((v) => v.stok_rusak > 0) && (
                  <label style={{ display: 'block', margin: '6px 0' }}>
                    <input type="checkbox" style={{ width: 'auto' }} checked={rusakMode} onChange={(e) => setRusakMode(e.target.checked)} /> Jual barang rusak
                    <span className="muted"> (stok rusak {num(sel.product.variants.reduce((x, v) => x + v.stok_rusak, 0))} {sel.product.base_unit}; harga bebas sesuai kesepakatan)</span>
                  </label>
                )}
                {!rusakMode && <div className="field">
                  <label>Warna (opsional; kosongkan kalau tidak yakin, dicek sore)</label>
                  <input value={variantId} onChange={(e) => setVariantId(e.target.value)} placeholder="mis. hitam, atau hitam 2, putih 2 (angka = satuan dasar). Sisanya otomatis & dicek sore" />
                </div>}
                <p className="muted">
                  Subtotal: {unit ? rp((Number(String(qty).replace(',', '.')) || 0) * (rusakMode ? Number(hargaRusak) || 0 : unit.price * (1 - (Number(disc) || 0) / 100))) : '-'}
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
                <thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Harga satuan</th><th className="r">Subtotal</th><th></th></tr></thead>
                <tbody>
                  {cartRows.map((g) => (
                    <tr key={g.idx[0]}>
                      <td>{g.c.product.name}{g.c.rusak && <span className="badge red"> rusak</span>}{g.c.disc > 0 && <span className="muted"> diskon {g.c.disc}%</span>}</td>
                      <td className="r">{num(g.qty)} {g.c.unit.name}</td>
                      <td className="r">{rp(priceOf(g.c))}</td>
                      <td className="r">{rp(g.sub)}</td>
                      <td><button className="secondary" onClick={() => setCart(cart.filter((_, j) => !g.idx.includes(j)))}>×</button></td>
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
          {known && (
            <div className="alert">
              Saldo titipan <strong>{rp(known.saldo || 0)}</strong>
              <div style={{ marginTop: 6 }}>
                <button className="secondary" onClick={titipSaldo}>Titip saldo</button>
              </div>
            </div>
          )}
          {known && known.total_hutang > 0 && (
            <div className="alert">
              ⚠️ Pembeli ini masih punya hutang <strong>{rp(known.total_hutang)}</strong>
              {known.last_hutang_date && ` per ${known.last_hutang_date}`}.
              {known.lewat_nota > 0 && <> <span className="badge red">{rp(known.lewat_tempo)} sudah lewat jatuh tempo ({known.lewat_nota} nota)</span></>}
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
            <div className="field"><label>E-wallet (QRIS, GoPay, ShopeePay)</label><input inputMode="numeric" value={ewallet} onChange={(e) => setEwallet(e.target.value)} /></div>
            {Number(ewallet) > 0 && (
              <div className="field"><label>Keterangan e-wallet</label><input list="ewallet-ket" value={ewalletKet} onChange={(e) => setEwalletKet(e.target.value)} placeholder="mis. QRIS" />
                <datalist id="ewallet-ket"><option value="QRIS" /><option value="GoPay" /><option value="ShopeePay" /></datalist></div>
            )}
            <div className="field"><label>Transfer</label><input inputMode="numeric" value={transfer} onChange={(e) => setTransfer(e.target.value)} /></div>
            {known && known.saldo > 0 && (
              <div className="field"><label>Saldo titipan (maks {rp(known.saldo)})</label><input inputMode="numeric" value={saldoPakai} onChange={(e) => setSaldoPakai(e.target.value)} /></div>
            )}
          </div>
          {known && known.total_hutang > 0 && (
            <div className="field">
              <label>Dari uang masuk, bayar hutang lama</label>
              <input inputMode="numeric" value={payDebt} onChange={(e) => setPayDebt(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label>Total dibulatkan staf (opsional, kosongkan bila tidak)</label>
            <input inputMode="numeric" value={totalBulat} onChange={(e) => setTotalBulat(e.target.value)} />
          </div>
          <table>
            <tbody>
              <tr><td>Total belanja</td><td className="r">{rp(total)}</td></tr>
              {pembulatan !== 0 && <tr><td>Pembulatan</td><td className="r">{pembulatan > 0 ? '+' : ''}{rp(pembulatan)}</td></tr>}
              <tr><td>Uang masuk</td><td className="r">{rp(paid)}</td></tr>
              {oldPay > 0 && <tr><td>Untuk hutang lama</td><td className="r">{rp(oldPay)}</td></tr>}
              <tr><td>Hutang baru</td><td className="r"><strong>{rp(hutangBaru)}</strong></td></tr>
              <tr><td>Kembalian</td><td className="r">{rp(kembalian)}</td></tr>
            </tbody>
          </table>
          {hutangBaru > 0 && (
            <div className="field" style={{ marginTop: 8 }}>
              <label>Jatuh tempo hutang (bawaan {tempoHari} hari)</label>
              <input type="date" value={jatuhTempo || tempoBawaan} min={tanggal(0)} onChange={(e) => setJatuhTempo(e.target.value)} />
            </div>
          )}
          {mirip && (
            <div className="alert">
              Nama <strong>{custName}</strong> mirip dengan pembeli yang sudah ada. Pakai yang sudah ada?
              <div style={{ marginTop: 6 }}>
                {mirip.list.map((c) => (
                  <button key={c.id} className="secondary" style={{ margin: '0 6px 6px 0' }} onClick={() => { chooseCustomer(c); setMirip(null); }}>
                    {c.name}{c.total_hutang > 0 ? ` (hutang ${rp(c.total_hutang)})` : ''}{c.address ? ` — ${c.address}` : ''}
                  </button>
                ))}
              </div>
              <button onClick={() => checkout(mirip.draft, true)}>Tetap buat pembeli baru "{custName}"</button>
            </div>
          )}
          {err && <div className="alert err">{err}</div>}
          {info && <div className="alert ok">{info}</div>}
          <button disabled={busy || cart.length === 0} onClick={() => checkout(false)} style={{ marginTop: 10, width: '100%' }}>
            Selesaikan transaksi
          </button>
          <button disabled={busy || cart.length === 0} className="secondary" onClick={() => checkout(true)} style={{ marginTop: 6, width: '100%' }}>
            Simpan sebagai draf
          </button>
        </div>
      </div>
    </>
  );
}

// Harga satuan baris keranjang: harga barang rusak diketik kasir, selain itu harga satuan produk.
const priceOf = (c) => (c.rusak ? c.harga : c.unit.price);
// Satu produk/satuan/diskon (dan harga rusak) yang terpecah ke beberapa warna dihitung sebagai satu kelompok.
const groupKey = (c) => `${c.product.id}:${c.unit.id}:${c.disc}:${c.rusak ? 'r' + c.harga : ''}`;

// Nota hanya per produk: baris yang terpecah per warna digabung (produk, satuan, harga, diskon sama).
function mergeItems(items) {
  const out = new Map();
  for (const i of items) {
    const key = `${i.product_name}|${i.unit_name}|${i.unit_price}|${i.discount_pct}|${i.dari_rusak}`;
    const g = out.get(key);
    if (g) { g.qty += i.qty; g.subtotal += i.subtotal; } else out.set(key, { ...i });
  }
  return [...out.values()];
}

function Nota({ nota, onClose }) {
  const line = { display: 'flex', justifyContent: 'space-between', gap: 8 };
  const bayar = nota.paid_cash + nota.paid_ewallet + nota.paid_transfer;
  return (
    <>
      <div className="card nota">
        <h2>Toko</h2>
        <div className="muted">{nota.created_at}</div>
        <div className="muted">No. {nota.id} • kasir {nota.kasir}{nota.customer_name && ` • ${nota.customer_name}`}</div>
        <hr style={{ borderStyle: 'dashed' }} />
        {mergeItems(nota.items).map((i) => (
          <div key={i.id} style={{ marginBottom: 6 }}>
            <div>{i.product_name} ({i.unit_name}){i.dari_rusak ? ' (rusak)' : ''}</div>
            <div style={line}>
              <span>{num(i.qty)} X {num(i.unit_price)}{i.discount_pct > 0 && ` (-${i.discount_pct}%)`}</span>
              <span>{rp(i.subtotal)}</span>
            </div>
          </div>
        ))}
        <hr style={{ borderStyle: 'dashed' }} />
        <div style={line}><strong>Total</strong><strong>{rp(nota.total)}</strong></div>
        {nota.paid_cash > 0 && <div style={line}><span>Bayar (Cash)</span><span>{rp(nota.paid_cash)}</span></div>}
        {nota.paid_ewallet > 0 && <div style={line}><span>Bayar (E-wallet{nota.ewallet_ket ? `, ${nota.ewallet_ket}` : ''})</span><span>{rp(nota.paid_ewallet)}</span></div>}
        {nota.paid_transfer > 0 && <div style={line}><span>Bayar (Transfer)</span><span>{rp(nota.paid_transfer)}</span></div>}
        {bayar > nota.total && <div style={line}><span>Kembali</span><span>{rp(bayar - nota.total)}</span></div>}
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
