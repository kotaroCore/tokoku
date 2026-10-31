'use client';
import { useEffect, useMemo, useState } from 'react';
import { rp, num } from '@/lib/format';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const METHOD = { cash: 'Cash', ewallet: 'E-wallet', transfer: 'Transfer', saldo: 'Saldo titipan' };
const PENGECUALIAN = {
  lewat_7_hari: 'Lewat 7 hari',
  tanpa_nota_asli: 'Nota asli tidak dibawa',
  paket_dibuka: 'Paket sudah dibuka',
  diskon: 'Barang diskon',
  benang_beda_warna: 'Benang beda warna',
  meteran: 'Barang meteran',
};

export default function Riwayat() {
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = () => fetch(`/api/sales?date=${date}`).then((r) => r.json()).then(setRows);
  useEffect(() => { load(); setOpenId(null); }, [date]);

  const shown = rows.filter((r) => `${r.nomor || r.id} ${r.customer_name || ''} ${r.kasir}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <h1>Riwayat nota &amp; retur</h1>
      <div className="card row">
        <div><label>Tanggal</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label>Cari (no. nota, pembeli, kasir)</label><input value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Nota</th><th>Jam</th><th>Pembeli</th><th>Kasir</th><th className="r">Total</th><th className="r">Retur</th></tr></thead>
          <tbody>
            {shown.map((s) => (
              <FragmentRow key={s.id} s={s} open={openId === s.id} onToggle={() => setOpenId(openId === s.id ? null : s.id)} onChanged={load} />
            ))}
            {shown.length === 0 && <tr><td colSpan="6" className="muted">Tidak ada nota.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FragmentRow({ s, open, onToggle, onChanged }) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer' }}>
        <td>{s.nomor || `#${s.id}`} {s.status !== 'lunas' && <span className="muted">({s.status === 'batal' ? 'batal' : s.menunggu_sejak ? 'menunggu konfirmasi' : 'draf'})</span>}</td>
        <td>{s.created_at.slice(11, 16)}</td>
        <td>{s.customer_name || '-'}</td>
        <td>{s.kasir}</td>
        <td className="r">{rp(s.total)}</td>
        <td className="r">{s.retur > 0 ? rp(s.retur) : ''}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan="6"><SaleDetail id={s.id} onChanged={onChanged} /></td>
        </tr>
      )}
    </>
  );
}

function SaleDetail({ id, onChanged }) {
  const [sale, setSale] = useState(null);
  const [qty, setQty] = useState({}); // sale_item_id -> jumlah yang diretur (teks)
  const [kondisi, setKondisi] = useState({}); // sale_item_id -> 'baik' | 'cacat' (default baik)
  const [pengecualian, setPengecualian] = useState([]);
  // Tukar barang: barang pengganti (variant_id, unit_id, qty) dan pembayaran selisihnya.
  const [tukarOpen, setTukarOpen] = useState(false);
  const [tukarLines, setTukarLines] = useState([]);
  const [bayarTukar, setBayarTukar] = useState({ cash: '', ewallet: '', ewalletKet: '', transfer: '', saldo: '' });
  const [produk, setProduk] = useState([]);
  useEffect(() => {
    if (tukarOpen && produk.length === 0) fetch('/api/products').then((r) => r.json()).then(setProduk);
  }, [tukarOpen]);

  const tukarItems = tukarLines.filter((l) => l.variant_id && l.unit_id && Number(l.qty) > 0).map((l) => ({ variant_id: Number(l.variant_id), unit_id: Number(l.unit_id), qty: Number(l.qty) }));
  // Perkiraan nilai barang pengganti (harga satuan hari ini); angka final dihitung server.
  const tukarTotal = tukarLines.reduce((sum, l) => {
    const p = produk.find((x) => x.variants.some((v) => v.id === Number(l.variant_id)));
    const u = p?.units.find((x) => x.id === Number(l.unit_id));
    return sum + (u ? u.price * (Number(l.qty) || 0) : 0);
  }, 0);
  const unitsOf = (variantId) => produk.find((x) => x.variants.some((v) => v.id === Number(variantId)))?.units || [];
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => fetch(`/api/sales?id=${id}`).then((r) => r.json()).then(setSale);
  useEffect(() => { load(); }, [id]);

  // Perkiraan nilai retur; angka final dihitung server.
  const preview = useMemo(() => {
    if (!sale) return null;
    let total = 0;
    for (const it of sale.items) {
      const n = Number(qty[it.id]) || 0;
      if (n <= 0) continue;
      const sisa = it.qty - it.returned_qty;
      total += n >= sisa - 1e-9 ? sisa / it.qty * it.subtotal : (it.subtotal * n) / it.qty;
    }
    total = Math.round(total);
    const sisaHutangNota = sale.hutang - sale.hutang_terbayar - sale.returns.reduce((s, r) => s + r.hutang_reduced, 0);
    const hutang = sale.customer_id ? Math.max(0, Math.min(total, sisaHutangNota, sale.customer_hutang)) : 0;
    return { total, hutang, refund: total - hutang };
  }, [sale, qty]);

  if (!sale) return <div className="muted">Memuat…</div>;

  const returnable = sale.status === 'lunas' && sale.items.some((it) => it.qty - it.returned_qty > 1e-9);

  // Nota draf: lunasi (stok berkurang di sini) atau batalkan dengan alasan.
  async function aksiDraf(url, body) {
    setErr('');
    setBusy(true);
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error);
    load();
    onChanged();
  }

  function lunasi() {
    const pesan = sale.menunggu_sejak
      ? `Dana ${sale.paid_transfer > 0 && sale.paid_ewallet <= 0 ? 'transfer' : 'e-wallet'} untuk nota ${sale.nomor} sudah masuk? Nota akan lunas dan stok berkurang.`
      : `Lunasi nota ${sale.nomor}? Stok barang akan dikurangi.`;
    if (!confirm(pesan)) return;
    aksiDraf(`/api/sales/${sale.id}/lunasi`, {});
  }

  function batalkan() {
    const alasan = prompt(`Alasan membatalkan nota ${sale.nomor}:`);
    if (!alasan || !alasan.trim()) return;
    aksiDraf(`/api/sales/${sale.id}/batal`, { alasan });
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const items = sale.items.filter((it) => Number(qty[it.id]) > 0).map((it) => ({ sale_item_id: it.id, qty: Number(qty[it.id]), kondisi: kondisi[it.id] || 'baik' }));
    if (!items.length) return setErr('Isi jumlah barang yang diretur');
    if (tukarLines.length && !tukarItems.length) return setErr('Lengkapi barang pengganti (barang, satuan, jumlah)');
    const pesan = tukarItems.length ? `Proses tukar barang? Nilai retur ${rp(preview.total)}, barang pengganti sekitar ${rp(tukarTotal)}. Ini tidak bisa dibatalkan.` : `Proses retur ${rp(preview.total)}? Ini tidak bisa dibatalkan.`;
    if (!confirm(pesan)) return;
    setBusy(true);
    const body = {
      sale_id: sale.id, items, pengecualian, refund_method: method, note,
      tukar: tukarItems,
      paid_cash: Number(bayarTukar.cash) || 0, paid_ewallet: Number(bayarTukar.ewallet) || 0, paid_ewallet_ket: bayarTukar.ewalletKet,
      paid_transfer: Number(bayarTukar.transfer) || 0, paid_saldo: Number(bayarTukar.saldo) || 0,
    };
    const kirim = (b) => fetch('/api/returns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    let r = await kirim(body);
    let d = await r.json();
    // Nota pengganti untuk pembeli baru yang namanya mirip pembeli lama.
    if (r.status === 409 && confirm(`${d.error}\n\nMirip: ${d.mirip.map((c) => c.name).join(', ')}\n\nOK = tetap buat pembeli baru.`)) {
      r = await kirim({ ...body, pembeli_baru: true });
      d = await r.json();
    }
    setBusy(false);
    if (!r.ok) return setErr(d.error);
    setDone(d);
    setQty({});
    setNote('');
    setTukarLines([]);
    setBayarTukar({ cash: '', ewallet: '', ewalletKet: '', transfer: '', saldo: '' });
    setTukarOpen(false);
    load();
    onChanged();
  }

  return (
    <div style={{ padding: '6px 0' }}>
      <div className="muted">
        Nota {sale.nomor || `#${sale.id}`} • {sale.created_at} • kasir {sale.kasir}{sale.customer_name && ` • ${sale.customer_name}`} • {sale.channel}
      </div>
      <div className="muted">
        Bayar: {sale.paid_cash > 0 && `cash ${rp(sale.paid_cash)} `}{sale.paid_ewallet > 0 && `e-wallet${sale.ewallet_ket ? ` (${sale.ewallet_ket})` : ''} ${rp(sale.paid_ewallet)} `}
        {sale.paid_transfer > 0 && `transfer ${rp(sale.paid_transfer)} `}{sale.hutang > 0 && `hutang ${rp(sale.hutang)}`}
      </div>

      {sale.status === 'draft' && (
        <div className="alert" style={{ marginTop: 8 }}>
          {sale.menunggu_sejak
            ? <>Menunggu konfirmasi dana e-wallet / transfer. Barang jangan diserahkan sebelum dana masuk. {sale.menit_menunggu >= 60 && <strong>⚠️ Sudah {sale.menit_menunggu} menit menunggu; cek mutasi.</strong>}</>
            : 'Nota draf: stok belum berkurang. Lunasi setelah pembayaran diterima, atau batalkan dengan alasan.'}
          {err && <div className="alert err">{err}</div>}
          <div className="row" style={{ marginTop: 8 }}>
            <button disabled={busy} onClick={lunasi}>{sale.menunggu_sejak ? 'Dana sudah masuk, lunasi' : 'Lunasi nota'}</button>
            <button disabled={busy} className="secondary" onClick={batalkan}>Batalkan draf</button>
          </div>
        </div>
      )}
      {sale.status === 'batal' && (
        <div className="alert err" style={{ marginTop: 8 }}>Nota dibatalkan: {sale.alasan_batal}</div>
      )}

      <form onSubmit={submit}>
        <table>
          <thead><tr><th>Barang</th><th className="r">Harga</th><th className="r">Dibeli</th><th className="r">Sudah diretur</th><th className="r">Retur sekarang</th></tr></thead>
          <tbody>
            {sale.items.map((it) => {
              const sisa = it.qty - it.returned_qty;
              return (
                <tr key={it.id}>
                  <td>{it.product_name}{it.color && ` — ${it.color}`}{it.dari_rusak ? ' (rusak)' : ''}</td>
                  <td className="r">{rp(it.unit_price)}{it.discount_pct > 0 && ` (-${num(it.discount_pct)}%)`} / {it.unit_name}</td>
                  <td className="r">{num(it.qty)} {it.unit_name}</td>
                  <td className="r">{it.returned_qty > 0 ? num(it.returned_qty) : ''}</td>
                  <td className="r">
                    {sisa > 1e-9 ? (
                      <span style={{ whiteSpace: 'nowrap' }}>
                        <input inputMode="decimal" style={{ width: 70 }} value={qty[it.id] ?? ''} onChange={(e) => setQty({ ...qty, [it.id]: e.target.value })} />{' '}
                        <select value={kondisi[it.id] || 'baik'} onChange={(e) => setKondisi({ ...kondisi, [it.id]: e.target.value })}>
                          <option value="baik">Baik</option>
                          <option value="cacat">Cacat</option>
                        </select>{' '}
                        <button type="button" className="secondary" onClick={() => setQty({ ...qty, [it.id]: String(sisa) })}>Semua</button>
                      </span>
                    ) : <span className="muted">habis diretur</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {returnable && (
          <>
            <div className="row" style={{ marginTop: 10 }}>
              <div className="field"><label>Uang kembali lewat</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)}>
                  {Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="field"><label>Catatan (alasan retur)</label><input value={note} onChange={(e) => setNote(e.target.value)} /></div>
            </div>
            <div className="muted" style={{ marginTop: 6 }}>Pengecualian (boleh dilewati, wajib isi catatan):</div>
            {Object.entries(PENGECUALIAN).map(([k, label]) => (
              <label key={k} style={{ display: 'block' }}>
                <input type="checkbox" checked={pengecualian.includes(k)} style={{ width: 'auto' }}
                  onChange={(e) => setPengecualian(e.target.checked ? [...pengecualian, k] : pengecualian.filter((x) => x !== k))} /> {label}
              </label>
            ))}
            {preview.total > 0 && (
              <div className="alert" style={{ marginTop: 8 }}>
                Nilai retur <strong>{rp(preview.total)}</strong>
                {preview.hutang > 0 && <> • memotong hutang <strong>{rp(preview.hutang)}</strong></>}
                {preview.refund > 0 && <> • uang kembali <strong>{rp(preview.refund)}</strong> ({METHOD[method]})</>}
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <button type="button" className="secondary" onClick={() => setTukarOpen(!tukarOpen)}>{tukarOpen ? 'Batal tukar barang' : 'Tukar dengan barang lain'}</button>
            </div>
            {tukarOpen && (
              <div className="card" style={{ marginTop: 8 }}>
                <div className="muted">Barang pengganti (harga hari ini). Nilai retur dipakai sebagai pembayaran pertama; selisih dibayar di bawah, atau kelebihannya dikembalikan lewat "Uang kembali lewat".</div>
                {tukarLines.map((l, i) => (
                  <div className="row" key={i} style={{ marginTop: 6 }}>
                    <select value={l.variant_id} onChange={(e) => setTukarLines(tukarLines.map((x, j) => (j === i ? { ...x, variant_id: e.target.value, unit_id: '' } : x)))}>
                      <option value="">Pilih barang</option>
                      {produk.flatMap((p) => p.variants.map((v) => <option key={v.id} value={v.id}>{p.name}{v.color && ` — ${v.color}`}</option>))}
                    </select>
                    <select value={l.unit_id} onChange={(e) => setTukarLines(tukarLines.map((x, j) => (j === i ? { ...x, unit_id: e.target.value } : x)))}>
                      <option value="">Satuan</option>
                      {unitsOf(l.variant_id).map((u) => <option key={u.id} value={u.id}>{u.name} ({rp(u.price)})</option>)}
                    </select>
                    <input inputMode="decimal" style={{ width: 70 }} value={l.qty} onChange={(e) => setTukarLines(tukarLines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                    <button type="button" className="secondary" onClick={() => setTukarLines(tukarLines.filter((_, j) => j !== i))}>Hapus</button>
                  </div>
                ))}
                <button type="button" className="secondary" style={{ marginTop: 6 }} onClick={() => setTukarLines([...tukarLines, { variant_id: '', unit_id: '', qty: '1' }])}>+ Tambah barang</button>
                <div className="row" style={{ marginTop: 8 }}>
                  {[['cash', 'Cash'], ['ewallet', 'E-wallet'], ['transfer', 'Transfer'], ['saldo', 'Saldo titipan']].map(([k, label]) => (
                    <div className="field" key={k}><label>{label} (selisih)</label><input inputMode="numeric" value={bayarTukar[k]} onChange={(e) => setBayarTukar({ ...bayarTukar, [k]: e.target.value })} /></div>
                  ))}
                  {Number(bayarTukar.ewallet) > 0 && (
                    <div className="field"><label>Keterangan e-wallet</label><input list="ewallet-ket" value={bayarTukar.ewalletKet} onChange={(e) => setBayarTukar({ ...bayarTukar, ewalletKet: e.target.value })} placeholder="mis. QRIS" /></div>
                  )}
                  <datalist id="ewallet-ket"><option value="QRIS" /><option value="GoPay" /><option value="ShopeePay" /></datalist>
                </div>
                <div className="muted">Perkiraan barang pengganti {rp(tukarTotal)}</div>
              </div>
            )}
            {err && <div className="alert err">{err}</div>}
            <button disabled={busy || preview.total <= 0} style={{ marginTop: 8 }}>{busy ? 'Memproses…' : tukarItems.length ? 'Proses tukar' : 'Proses retur'}</button>
          </>
        )}
      </form>

      {done && (
        <div className="alert ok">
          Retur #{done.id} tersimpan: {rp(done.total)}
          {done.hutangReduced > 0 && `, hutang dipotong ${rp(done.hutangReduced)}`}
          {done.refund > 0 && `, kembalikan ${rp(done.refund)} (${METHOD[done.method]})`}.
          {done.tukarNota && <> Nota pengganti <strong>{done.tukarNota.nomor}</strong> ({rp(done.tukarNota.total)}) lunas.</>}
        </div>
      )}

      {sale.returns.length > 0 && (
        <>
          <h2 style={{ marginTop: 12 }}>Riwayat retur nota ini</h2>
          {sale.returns.map((r) => (
            <div key={r.id} className="muted">
              #{r.id} • {r.created_at} • {r.kasir} • {rp(r.total)}
              {r.hutang_reduced > 0 && ` • hutang -${rp(r.hutang_reduced)}`}
              {r.refund_amount > 0 && ` • kembali ${rp(r.refund_amount)} (${METHOD[r.refund_method]})`}
              {r.pengecualian && ` • pengecualian: ${r.pengecualian.split(',').map((k) => PENGECUALIAN[k] || k).join(', ')}`}{r.note && ` • "${r.note}"`}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
