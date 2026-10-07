'use client';
import { useEffect, useState } from 'react';
import { rp, num } from '@/lib/format';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function Laporan() {
  const [date, setDate] = useState(today());
  const [d, setD] = useState(null);

  useEffect(() => {
    fetch(`/api/reports?date=${date}`).then((r) => r.json()).then(setD);
  }, [date]);

  return (
    <>
      <h1>Laporan harian</h1>
      <div className="card noprint row">
        <div><label>Tanggal</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><button onClick={() => window.print()}>Cetak</button></div>
      </div>
      {d && (
        <>
          <div className="grid stats">
            <div className="card stat"><div className="v">{rp(d.omset)}</div><div className="l">Omset ({d.jumlah_nota} nota)</div></div>
            <div className="card stat"><div className="v">{rp(d.cash)}</div><div className="l">Cash</div></div>
            <div className="card stat"><div className="v">{rp(d.ewallet)}</div><div className="l">E-wallet</div></div>
            <div className="card stat"><div className="v">{rp(d.transfer)}</div><div className="l">Transfer</div></div>
            <div className="card stat"><div className="v">{rp(d.hutang_baru)}</div><div className="l">Hutang baru</div></div>
            <div className="card stat"><div className="v">{rp(d.hutangDibayar)}</div><div className="l">Hutang dibayar</div></div>
          </div>
          <div className="grid cols2">
            <div className="card">
              <h2>Produk terlaris</h2>
              <table>
                <thead><tr><th>Produk</th><th className="r">Qty dasar</th><th className="r">Omset</th></tr></thead>
                <tbody>
                  {d.terlaris.map((t) => (
                    <tr key={t.product_name}><td>{t.product_name}</td><td className="r">{num(t.qty_dasar)}</td><td className="r">{rp(t.omset)}</td></tr>
                  ))}
                  {d.terlaris.length === 0 && <tr><td colSpan="3" className="muted">Belum ada penjualan.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h2>Per kasir &amp; channel</h2>
              <table>
                <tbody>
                  {d.perUser.map((u) => <tr key={u.name}><td>{u.name}</td><td className="r">{u.nota} nota</td><td className="r">{rp(u.omset)}</td></tr>)}
                  {d.perChannel.map((c) => <tr key={c.channel}><td>{c.channel}</td><td className="r">{c.nota} nota</td><td className="r">{rp(c.omset)}</td></tr>)}
                </tbody>
              </table>
              <h2 style={{ marginTop: 14 }}>Shift</h2>
              <table>
                <thead><tr><th>User</th><th>Mulai</th><th>Selesai</th><th className="r">Nota</th></tr></thead>
                <tbody>
                  {d.shifts.map((s, i) => (
                    <tr key={i}><td>{s.name}</td><td>{s.started_at.slice(11, 16)}</td><td>{s.ended_at ? s.ended_at.slice(11, 16) : 'aktif'}</td><td className="r">{s.nota}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="muted">Total hutang beredar saat ini: {rp(d.totalHutang)}</p>
        </>
      )}
    </>
  );
}
