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
            <div className="card stat"><div className="v">{rp(d.retur.total)}</div><div className="l">Retur ({d.retur.jumlah}x)</div></div>
            <div className="card stat"><div className="v">{rp(d.omset - d.retur.total)}</div><div className="l">Omset bersih</div></div>
            <div className="card stat"><div className="v">{rp(d.pembelian.total)}</div><div className="l">Pembelian ({d.pembelian.jumlah}x)</div></div>
            <div className="card stat"><div className="v">{rp(d.laba)}</div><div className="l">Profit (laba kotor)</div></div>
            <div className="card stat"><div className="v">{rp(d.labaCash)}</div><div className="l">Laba dari penjualan cash</div></div>
            <div className="card stat"><div className="v">{rp(d.cash - d.retur.cash - d.pembelian.cash)}</div><div className="l">Cash bersih (setelah retur &amp; pembelian)</div></div>
            <div className="card stat">
              <div className="v">{rp(d.asetBarang.total)}</div>
              <div className="l">
                Total aset barang{' '}
                <span className="badge green" title="Produk yang sudah punya harga kulaan">{d.asetBarang.adaHarga}</span>{' '}
                <span className="badge red" title="Produk belum punya harga kulaan">{d.asetBarang.tanpaHarga}</span>
              </div>
            </div>
          </div>
          {d.asetBarang.tanpaHarga > 0 && (
            <p className="muted">{d.asetBarang.tanpaHarga} produk (angka merah) belum punya harga kulaan, jadi belum masuk total aset barang.</p>
          )}
          {d.tanpaModal > 0 && (
            <p className="muted">{d.tanpaModal} item terjual belum punya harga beli, jadi belum masuk hitungan profit.</p>
          )}
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
          {d.retur.jumlah > 0 && (
            <p className="muted">
              Retur hari ini: hutang dikurangi {rp(d.retur.hutang_dikurangi)}; uang keluar cash {rp(d.retur.cash)},
              e-wallet {rp(d.retur.ewallet)}, transfer {rp(d.retur.transfer)}. Kartu Cash, E-wallet, dan Transfer di atas belum dikurangi uang retur.
            </p>
          )}
          {d.pembelian.jumlah > 0 && (
            <p className="muted">
              Pembelian hari ini dibayar: cash {rp(d.pembelian.cash)}, e-wallet {rp(d.pembelian.ewallet)}, transfer {rp(d.pembelian.transfer)}.
            </p>
          )}
          <p className="muted">Total hutang beredar saat ini: {rp(d.totalHutang)}</p>
        </>
      )}
    </>
  );
}
