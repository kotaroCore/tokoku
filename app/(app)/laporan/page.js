'use client';
import { useEffect, useState } from 'react';
import { rp, num } from '@/lib/format';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const METODE = [
  ['cash', 'Cash'],
  ['ewallet', 'E-wallet'],
  ['transfer', 'Transfer'],
];

// Susun laporan jadi CSV: ringkasan, kas, terlaris, per kasir, per channel, shift.
function buatCsv(d) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const baris = [];
  const tambah = (...kolom) => baris.push(kolom.map(esc).join(','));
  const kosong = () => baris.push('');

  tambah('Laporan', d.from === d.to ? d.from : `${d.from} s/d ${d.to}`);
  kosong();
  tambah('Ringkasan', 'Nilai');
  tambah('Omset', Number(d.omset));
  tambah('Jumlah nota', d.jumlah_nota);
  tambah('Cash', d.cash);
  tambah('E-wallet', d.ewallet);
  tambah('Transfer', d.transfer);
  tambah('Hutang baru', d.hutang_baru);
  tambah('Hutang dibayar', d.hutangDibayar);
  tambah('Retur', d.retur.total);
  tambah('Omset bersih', Number(d.omset) - Number(d.retur.total));
  tambah('Pembelian', d.pembelian.total);
  tambah('Total hutang beredar (saat ini)', d.totalHutang);
  kosong();
  tambah('Kas per metode', 'Masuk', 'Keluar', 'Bersih');
  for (const [k, label] of METODE) tambah(label, d.kas[k].masuk, d.kas[k].keluar, d.kas[k].bersih);
  kosong();
  tambah('Produk terlaris', 'Qty dasar', 'Omset');
  for (const t of d.terlaris) tambah(t.product_name, t.qty_dasar, t.omset);
  kosong();
  tambah('Per kasir', 'Nota', 'Omset');
  for (const u of d.perUser) tambah(u.name, u.nota, u.omset);
  kosong();
  tambah('Per channel', 'Nota', 'Omset');
  for (const c of d.perChannel) tambah(c.channel, c.nota, c.omset);
  kosong();
  tambah('Shift', 'Mulai', 'Selesai', 'Nota');
  for (const s of d.shifts) {
    tambah(s.name, s.started_at, s.ended_at || 'aktif', s.nota);
  }
  return baris.join('\n');
}

function unduhCsv(d) {
  const isi = '﻿' + buatCsv(d); // BOM agar Excel membaca UTF-8 dengan benar
  const url = URL.createObjectURL(new Blob([isi], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `laporan_${d.from}_${d.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Laporan() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [d, setD] = useState(null);

  useEffect(() => {
    fetch(`/api/reports?from=${from}&to=${to}`).then((r) => r.json()).then(setD);
  }, [from, to]);

  const satuHari = d && d.from === d.to;

  return (
    <>
      <h1>Laporan {satuHari ? 'harian' : 'rentang tanggal'}</h1>
      <div className="card noprint row">
        <div><label>Dari</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label>Sampai</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div><button onClick={() => setTo(from)}>Hari ini saja</button></div>
        <div><button onClick={() => d && unduhCsv(d)} disabled={!d}>Unduh CSV</button></div>
        <div><button onClick={() => window.print()}>Cetak</button></div>
      </div>
      {d && (
        <>
          <div className="grid stats">
            <div className="card stat"><div className="v">{rp(d.omset)}</div><div className="l">Omset ({d.jumlah_nota} nota)</div></div>
            <div className="card stat"><div className="v">{rp(d.cash)}</div><div className="l">Cash masuk</div></div>
            <div className="card stat"><div className="v">{rp(d.ewallet)}</div><div className="l">E-wallet masuk</div></div>
            <div className="card stat"><div className="v">{rp(d.transfer)}</div><div className="l">Transfer masuk</div></div>
            <div className="card stat"><div className="v">{rp(d.hutang_baru)}</div><div className="l">Hutang baru</div></div>
            <div className="card stat"><div className="v">{rp(d.hutangDibayar)}</div><div className="l">Hutang dibayar</div></div>
            <div className="card stat"><div className="v">{rp(d.retur.total)}</div><div className="l">Retur ({d.retur.jumlah}x)</div></div>
            <div className="card stat"><div className="v">{rp(d.omset - d.retur.total)}</div><div className="l">Omset bersih</div></div>
            <div className="card stat"><div className="v">{rp(d.pembelian.total)}</div><div className="l">Pembelian ({d.pembelian.jumlah}x)</div></div>
          </div>
          <div className="card" style={{ marginTop: 14 }}>
            <h2>Kas per metode</h2>
            <table>
              <thead><tr><th>Metode</th><th className="r">Masuk</th><th className="r">Keluar (retur + pembelian)</th><th className="r">Bersih</th></tr></thead>
              <tbody>
                {METODE.map(([k, label]) => (
                  <tr key={k}>
                    <td>{label}</td>
                    <td className="r">{rp(d.kas[k].masuk)}</td>
                    <td className="r">{rp(d.kas[k].keluar)}</td>
                    <td className="r">{rp(d.kas[k].bersih)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">
              Hutang dibayar ({rp(d.hutangDibayar)}) tidak masuk kas per metode, karena pembayaran hutang belum mencatat metode bayar.
            </p>
          </div>
          <div className="grid cols2" style={{ marginTop: 14 }}>
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
                    <tr key={i}><td>{s.name}</td><td>{s.started_at.slice(0, 16).replace('T', ' ')}</td><td>{s.ended_at ? s.ended_at.slice(11, 16) : 'aktif'}</td><td className="r">{s.nota}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {d.retur.jumlah > 0 && (
            <p className="muted">
              Retur di rentang ini: hutang dikurangi {rp(d.retur.hutang_dikurangi)}; uang keluar cash {rp(d.retur.cash)},
              e-wallet {rp(d.retur.ewallet)}, transfer {rp(d.retur.transfer)}.
            </p>
          )}
          {d.pembelian.jumlah > 0 && (
            <p className="muted">
              Pembelian di rentang ini dibayar: cash {rp(d.pembelian.cash)}, e-wallet {rp(d.pembelian.ewallet)}, transfer {rp(d.pembelian.transfer)}.
            </p>
          )}
          <p className="muted">Total hutang beredar saat ini: {rp(d.totalHutang)}</p>
        </>
      )}
    </>
  );
}
