'use client';
import { useEffect, useState } from 'react';
import { num, rp } from '@/lib/format';

const LABEL = { ok: 'Aman', green: 'Mulai menipis', yellow: 'Waspada', red: 'Kritis', none: '-' };

export default function Cek() {
  const [pending, setPending] = useState([]);
  const [stock, setStock] = useState([]);
  const [q, setQ] = useState('');
  const [input, setInput] = useState({}); // `${product_id}:${variant_id}` -> teks
  const [msg, setMsg] = useState('');
  const [titipLama, setTitipLama] = useState([]);
  const [menunggu, setMenunggu] = useState([]);

  const load = () => {
    fetch('/api/cek-sore').then((r) => r.json()).then(setPending);
    fetch('/api/stock').then((r) => r.json()).then(setStock);
    fetch('/api/saldo?stale=1').then((r) => r.json()).then(setTitipLama);
    fetch('/api/sales?menunggu=1').then((r) => r.json()).then(setMenunggu);
  };
  useEffect(() => { load(); }, []);

  const key = (p, v) => `${p.product_id}:${v.id}`;
  const val = (p, v) => Number(String(input[key(p, v)] || '').replace(',', '.')) || 0;
  const sumOf = (p) => p.variants.reduce((s, v) => s + val(p, v), 0);

  async function submit(p) {
    setMsg('');
    const allocations = p.variants.map((v) => ({ variant_id: v.id, qty: val(p, v) })).filter((a) => a.qty > 0);
    const r = await fetch('/api/cek-sore', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: p.product_id, allocations }),
    });
    setMsg(r.ok ? `${p.product_name}: stok sudah dikoreksi.` : (await r.json()).error);
    load();
  }

  const shown = stock.filter((v) => `${v.product_name} ${v.color} ${v.category}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <h1>Cek</h1>
      {msg && <div className="alert ok">{msg}</div>}

      <div className="card">
        <h2>Cek sore: warna belum diinput</h2>
        {!pending.length ? <p className="muted">Tidak ada yang perlu dicek.</p> : (
          <>
            <p className="muted">Stok ini diambil otomatis saat toko buka. Isi jumlah per warna yang sebenarnya terjual; stok otomatis dikembalikan lalu dipotong sesuai isian.</p>
            {pending.map((p) => (
              <div key={p.product_id} style={{ marginBottom: 16 }}>
                <b>{p.product_name}</b> — terjual {num(p.total)} {p.base_unit}
                <div className="muted">Diambil otomatis dari: {p.taken.map((t) => `${t.color || '-'} ${num(t.qty)}`).join(', ')}</div>
                <table>
                  <thead><tr><th>Warna</th><th className="r">Stok</th><th className="r">Terjual ({p.base_unit})</th></tr></thead>
                  <tbody>
                    {p.variants.map((v) => (
                      <tr key={v.id}>
                        <td>{v.color || '-'}</td>
                        <td className="r">{num(v.stock)}</td>
                        <td className="r">
                          <input style={{ width: 90 }} inputMode="decimal" value={input[key(p, v)] || ''}
                            onChange={(e) => setInput({ ...input, [key(p, v)]: e.target.value })} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>
                  Terisi {num(sumOf(p))} dari {num(p.total)} {p.base_unit}{' '}
                  <button disabled={Math.abs(sumOf(p) - p.total) > 1e-6} onClick={() => submit(p)}>Simpan koreksi</button>
                </p>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="card">
        <h2>Pembayaran menunggu konfirmasi</h2>
        {!menunggu.length ? <p className="muted">Tidak ada.</p> : (
          <>
            <p className="muted">Cek mutasi e-wallet / transfer. Konfirmasi lewat Riwayat; barang belum boleh diserahkan sebelum dana masuk.</p>
            <table>
              <thead><tr><th>Nota</th><th>Pembeli</th><th>Metode</th><th className="r">Tagihan</th><th className="r">Menunggu</th></tr></thead>
              <tbody>
                {menunggu.map((n) => (
                  <tr key={n.id}>
                    <td>{n.nomor}</td><td>{n.customer_name || '-'}</td>
                    <td>{n.paid_ewallet > 0 ? `E-wallet${n.ewallet_ket ? ' (' + n.ewallet_ket + ')' : ''}` : ''}{n.paid_transfer > 0 ? ' Transfer' : ''}</td>
                    <td className="r">{rp(n.tagihan)}</td>
                    <td className="r">{n.menit >= 60 ? <span className="badge red">⚠️ {n.menit} menit</span> : `${n.menit} menit`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card">
        <h2>Saldo titipan lebih dari satu tahun</h2>
        {!titipLama.length ? <p className="muted">Tidak ada.</p> : (
          <>
            <p className="muted">Dihitung dari titipan terakhir. Tanyakan ke pembeli atau kembalikan saldonya.</p>
            <table>
              <thead><tr><th>Pembeli</th><th>Kontak</th><th>Titipan terakhir</th><th className="r">Saldo</th></tr></thead>
              <tbody>
                {titipLama.map((c) => (
                  <tr key={c.id}><td>{c.name}</td><td>{c.phone || '-'}</td><td>{c.titipan_terakhir}</td><td className="r">{rp(c.saldo)}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card">
        <h2>Cek stok produk</h2>
        <div className="field"><label>Cari</label><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nama produk / warna" /></div>
        <table>
          <thead><tr><th>Produk</th><th>Warna</th><th className="r">Stok</th><th>Status</th></tr></thead>
          <tbody>
            {shown.map((v) => (
              <tr key={v.id}>
                <td>{v.product_name}</td><td>{v.color || '-'}</td>
                <td className="r">{num(v.stock)} {v.base_unit}</td>
                <td><span className={`badge ${v.status}`}>{LABEL[v.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
