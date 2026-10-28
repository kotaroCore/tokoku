'use client';
import { useEffect, useMemo, useState } from 'react';
import { rp, num } from '@/lib/format';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const METHOD = { cash: 'Cash', ewallet: 'E-wallet', transfer: 'Transfer' };

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
        <td>{s.nomor || `#${s.id}`} {s.status !== 'lunas' && <span className="muted">({s.status === 'draft' ? 'draf' : 'batal'})</span>}</td>
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
  const [restock, setRestock] = useState(true);
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
    const sisaHutangNota = sale.hutang - sale.returns.reduce((s, r) => s + r.hutang_reduced, 0);
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
    if (!confirm(`Lunasi nota ${sale.nomor}? Stok barang akan dikurangi.`)) return;
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
    const items = sale.items.filter((it) => Number(qty[it.id]) > 0).map((it) => ({ sale_item_id: it.id, qty: Number(qty[it.id]) }));
    if (!items.length) return setErr('Isi jumlah barang yang diretur');
    if (!confirm(`Proses retur ${rp(preview.total)}? Ini tidak bisa dibatalkan.`)) return;
    setBusy(true);
    const r = await fetch('/api/returns', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sale_id: sale.id, items, restock, refund_method: method, note }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error);
    setDone(d);
    setQty({});
    setNote('');
    load();
    onChanged();
  }

  return (
    <div style={{ padding: '6px 0' }}>
      <div className="muted">
        Nota {sale.nomor || `#${sale.id}`} • {sale.created_at} • kasir {sale.kasir}{sale.customer_name && ` • ${sale.customer_name}`} • {sale.channel}
      </div>
      <div className="muted">
        Bayar: {sale.paid_cash > 0 && `cash ${rp(sale.paid_cash)} `}{sale.paid_ewallet > 0 && `e-wallet ${rp(sale.paid_ewallet)} `}
        {sale.paid_transfer > 0 && `transfer ${rp(sale.paid_transfer)} `}{sale.hutang > 0 && `hutang ${rp(sale.hutang)}`}
      </div>

      {sale.status === 'draft' && (
        <div className="alert" style={{ marginTop: 8 }}>
          Nota draf: stok belum berkurang. Lunasi setelah pembayaran diterima, atau batalkan dengan alasan.
          {err && <div className="alert err">{err}</div>}
          <div className="row" style={{ marginTop: 8 }}>
            <button disabled={busy} onClick={lunasi}>Lunasi nota</button>
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
                  <td>{it.product_name}{it.color && ` — ${it.color}`}</td>
                  <td className="r">{rp(it.unit_price)}{it.discount_pct > 0 && ` (-${num(it.discount_pct)}%)`} / {it.unit_name}</td>
                  <td className="r">{num(it.qty)} {it.unit_name}</td>
                  <td className="r">{it.returned_qty > 0 ? num(it.returned_qty) : ''}</td>
                  <td className="r">
                    {sisa > 1e-9 ? (
                      <span style={{ whiteSpace: 'nowrap' }}>
                        <input inputMode="decimal" style={{ width: 70 }} value={qty[it.id] ?? ''} onChange={(e) => setQty({ ...qty, [it.id]: e.target.value })} />{' '}
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
            <label><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} style={{ width: 'auto' }} /> Kembalikan barang ke stok (matikan bila rusak/cacat)</label>
            {preview.total > 0 && (
              <div className="alert" style={{ marginTop: 8 }}>
                Nilai retur <strong>{rp(preview.total)}</strong>
                {preview.hutang > 0 && <> • memotong hutang <strong>{rp(preview.hutang)}</strong></>}
                {preview.refund > 0 && <> • uang kembali <strong>{rp(preview.refund)}</strong> ({METHOD[method]})</>}
              </div>
            )}
            {err && <div className="alert err">{err}</div>}
            <button disabled={busy || preview.total <= 0} style={{ marginTop: 8 }}>{busy ? 'Memproses…' : 'Proses retur'}</button>
          </>
        )}
      </form>

      {done && (
        <div className="alert ok">
          Retur #{done.id} tersimpan: {rp(done.total)}
          {done.hutangReduced > 0 && `, hutang dipotong ${rp(done.hutangReduced)}`}
          {done.refund > 0 && `, serahkan uang ${rp(done.refund)} (${METHOD[done.method]})`}.
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
              {!r.restock && ' • tidak masuk stok'}{r.note && ` • "${r.note}"`}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
