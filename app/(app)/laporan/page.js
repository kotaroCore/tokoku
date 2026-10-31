'use client';
import { useEffect, useMemo, useState } from 'react';
import { rp, num } from '@/lib/format';
import { GrafikBatang, GrafikGaris } from './Grafik';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const METODE = [
  ['cash', 'Cash'],
  ['ewallet', 'E-wallet'],
  ['transfer', 'Transfer'],
];
const PER = { hari: 'Per hari', minggu: 'Per minggu', bulan: 'Per bulan' };

// Susun laporan jadi CSV: ringkasan, kas, per kategori, terlaris, per kasir, per channel, shift.
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
  tambah('Total pembulatan', Number(d.pembulatan));
  tambah('Hutang dibayar', d.hutangDibayar);
  tambah('Retur', d.retur.total);
  tambah('Omset bersih', Number(d.omset) - Number(d.retur.total));
  if (d.laba) tambah('Laba kotor', d.laba.laba);
  if (d.rusak.kerugian != null) tambah('Kerugian barang rusak dibuang', d.rusak.kerugian);
  tambah('Pembelian', d.pembelian.total);
  tambah('Total hutang beredar (saat ini)', d.totalHutang);
  kosong();
  tambah('Kas per metode', 'Masuk', 'Keluar', 'Bersih');
  for (const [k, label] of METODE) tambah(label, d.kas[k].masuk, d.kas[k].keluar, d.kas[k].bersih);
  kosong();
  tambah('Per kategori', 'Omset', 'Persen', ...(d.bolehLaba ? ['Laba kotor', 'Margin %'] : []));
  for (const k of d.perKategori) tambah(k.category, k.omset, k.persen, ...(d.bolehLaba ? [k.laba, k.margin] : []));
  kosong();
  tambah('Terlaris (omset)', 'Qty dasar', 'Omset');
  for (const t of d.laris.omset) tambah(t.product_name, t.qty_dasar, t.omset);
  kosong();
  tambah('Per kasir', 'Nota', 'Omset');
  for (const u of d.perUser) tambah(u.name, u.nota, u.omset);
  kosong();
  tambah('Diskon per kasir', 'Baris', 'Diskon');
  for (const x of d.diskon) tambah(x.name, x.baris, x.diskon);
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

const tglPendek = (s) => (s.length === 7 ? s : s.slice(5).split('-').reverse().join('/'));

export default function Laporan() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [per, setPer] = useState('hari');
  const [d, setD] = useState(null);
  const [produk, setProduk] = useState([]);

  useEffect(() => {
    fetch(`/api/reports?from=${from}&to=${to}&tren=${per}`).then((r) => r.json()).then(setD);
  }, [from, to, per]);
  useEffect(() => { fetch('/api/products?all=1').then((r) => r.json()).then(setProduk); }, []);

  const satuHari = d && d.from === d.to;

  return (
    <div className="laporan">
      <h1>Laporan {satuHari ? 'harian' : 'rentang tanggal'}</h1>
      <p className="hanya-cetak">{d && (satuHari ? d.from : `${d.from} s/d ${d.to}`)}</p>
      <div className="card noprint row">
        <div><label>Dari</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label>Sampai</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div><button onClick={() => { setFrom(today()); setTo(today()); }}>Hari ini saja</button></div>
        <div><button className="secondary" onClick={() => d && unduhCsv(d)} disabled={!d}>Unduh CSV</button></div>
        <div><button className="secondary" onClick={() => window.print()} disabled={!d} title="Pilih 'Simpan sebagai PDF' di dialog cetak">Simpan PDF</button></div>
      </div>
      {d && (
        <>
          <div className="grid stats">
            <div className="card stat"><div className="v">{rp(d.omset)}</div><div className="l">Omset ({d.jumlah_nota} nota)</div></div>
            <div className="card stat"><div className="v">{rp(d.omset - d.retur.total)}</div><div className="l">Omset bersih</div></div>
            {d.laba && <div className="card stat"><div className="v">{rp(d.laba.laba)}</div><div className="l">Laba kotor (modal {rp(d.laba.modal)})</div></div>}
            <div className="card stat"><div className="v">{rp(d.cash)}</div><div className="l">Cash masuk</div></div>
            <div className="card stat"><div className="v">{rp(d.ewallet)}</div><div className="l">E-wallet masuk</div></div>
            <div className="card stat"><div className="v">{rp(d.transfer)}</div><div className="l">Transfer masuk</div></div>
            <div className="card stat"><div className="v">{rp(d.hutang_baru)}</div><div className="l">Hutang baru</div></div>
            <div className="card stat"><div className="v">{rp(d.hutangDibayar)}</div><div className="l">Hutang dibayar</div></div>
            <div className="card stat"><div className="v">{rp(d.retur.total)}</div><div className="l">Retur ({d.retur.jumlah}x)</div></div>
            <div className="card stat"><div className="v">{rp(d.pembulatan)}</div><div className="l">Total pembulatan</div></div>
            <div className="card stat"><div className="v">{rp(d.pembelian.total)}</div><div className="l">Pembelian ({d.pembelian.jumlah}x)</div></div>
            {d.rusak.kerugian != null && <div className="card stat"><div className="v">{rp(d.rusak.kerugian)}</div><div className="l">Kerugian barang dibuang</div></div>}
          </div>
          {!d.bolehLaba && <p className="muted">Laba, modal, dan nilai stok hanya tampil untuk admin atau staf yang diberi izin.</p>}

          <div className="grid cols2" style={{ marginTop: 14 }}>
            <div className="card">
              <h2>Kas per metode</h2>
              <table>
                <thead><tr><th>Metode</th><th className="r">Masuk</th><th className="r">Keluar</th><th className="r">Bersih</th></tr></thead>
                <tbody>
                  {METODE.map(([k, label]) => (
                    <tr key={k}><td>{label}</td><td className="r">{rp(d.kas[k].masuk)}</td><td className="r">{rp(d.kas[k].keluar)}</td><td className="r">{rp(d.kas[k].bersih)}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">Keluar = retur + pembelian. Hutang dibayar ({rp(d.hutangDibayar)}) tidak masuk kas per metode.</p>
            </div>
            <div className="card">
              <h2>Per kategori</h2>
              <table>
                <thead><tr><th>Kategori</th><th className="r">Omset</th><th className="r">%</th>{d.bolehLaba && <><th className="r">Laba kotor</th><th className="r">Margin</th></>}</tr></thead>
                <tbody>
                  {d.perKategori.map((k) => (
                    <tr key={k.category}>
                      <td>{k.category}</td><td className="r">{rp(k.omset)}</td><td className="r">{num(k.persen)}%</td>
                      {d.bolehLaba && <><td className="r">{rp(k.laba)}</td><td className="r">{num(k.margin)}%</td></>}
                    </tr>
                  ))}
                  {!d.perKategori.length && <tr><td colSpan="5" className="muted">Belum ada penjualan.</td></tr>}
                </tbody>
              </table>
              <p className="muted">Sudah dikurangi retur.</p>
            </div>
          </div>

          <div className="card">
            <div className="row" style={{ alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Tren omset</h2>
              <select className="noprint" value={per} onChange={(e) => setPer(e.target.value)} style={{ width: 'auto' }}>
                {Object.entries(PER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <GrafikBatang
              labelSumbu={tglPendek}
              data={d.tren.map((t) => ({ label: t.label, nilai: Number(t.omset), teks: `${per === 'minggu' ? 'Minggu ' : ''}${tglPendek(t.label)}: ${rp(t.omset)}, ${t.nota} nota` }))}
            />
            <details className="noprint"><summary>Tabel</summary>
              <table><tbody>{d.tren.map((t) => <tr key={t.label}><td>{t.label}</td><td className="r">{t.nota} nota</td><td className="r">{rp(t.omset)}</td></tr>)}</tbody></table>
            </details>
          </div>

          <div className="grid cols2">
            <div className="card">
              <h2>20 terlaris menurut omset</h2>
              <TabelLaris rows={d.laris.omset} />
            </div>
            <div className="card">
              <h2>20 terlaris menurut jumlah</h2>
              <TabelLaris rows={d.laris.jumlah} />
            </div>
          </div>

          <div className="grid cols2">
            <div className="card">
              <h2>Per kasir &amp; channel</h2>
              <table>
                <tbody>
                  {d.perUser.map((u) => <tr key={u.name}><td>{u.name}</td><td className="r">{u.nota} nota</td><td className="r">{rp(u.omset)}</td></tr>)}
                  {d.perChannel.map((c) => <tr key={c.channel}><td>{c.channel}</td><td className="r">{c.nota} nota</td><td className="r">{rp(c.omset)}</td></tr>)}
                </tbody>
              </table>
              <h2 style={{ marginTop: 14 }}>Diskon per kasir</h2>
              {!d.diskon.length ? <p className="muted">Tidak ada diskon.</p> : (
                <table>
                  <tbody>{d.diskon.map((x) => <tr key={x.name}><td>{x.name}</td><td className="r">{x.baris} baris</td><td className="r">{rp(x.diskon)}</td></tr>)}</tbody>
                </table>
              )}
            </div>
            <div className="card">
              <h2>Shift</h2>
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

          <div className="card">
            <h2>Hutang lewat jatuh tempo (saat ini)</h2>
            {!d.hutangLewat.length ? <p className="muted">Tidak ada.</p> : (
              <table>
                <thead><tr><th>Pembeli</th><th>Nota (tanggal, jatuh tempo, umur)</th><th className="r">Sisa</th></tr></thead>
                <tbody>
                  {d.hutangLewat.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}<div className="muted">{c.phone || ''}</div></td>
                      <td>{c.notas.map((n) => <div key={n.id}>{n.nomor} • {n.tanggal} • tempo {n.jatuh_tempo} • {n.umur} hari • {rp(n.sisa)}</div>)}</td>
                      <td className="r">{rp(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid cols2">
            <div className="card">
              <h2>Lambat laku (tidak terjual {d.hariLambat} hari)</h2>
              {!d.lambat.length ? <p className="muted">Tidak ada.</p> : (
                <table>
                  <thead><tr><th>Produk</th><th className="r">Stok</th>{d.bolehLaba && <th className="r">Nilai stok</th>}<th>Terakhir terjual</th></tr></thead>
                  <tbody>
                    {d.lambat.map((p) => (
                      <tr key={p.id}><td><span className="muted">{p.category}</span> {p.name}</td><td className="r">{num(p.stok)} {p.base_unit}</td>{d.bolehLaba && <td className="r">{rp(p.nilai)}</td>}<td>{p.terakhir_terjual || 'belum pernah'}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="card">
              <h2>Stok rusak</h2>
              {!d.rusak.sekarang.length ? <p className="muted">Tidak ada stok rusak saat ini.</p> : (
                <table>
                  <thead><tr><th>Produk (saat ini)</th><th className="r">Stok rusak</th>{d.bolehLaba && <th className="r">Nilai</th>}</tr></thead>
                  <tbody>
                    {d.rusak.sekarang.map((p) => <tr key={p.id}><td>{p.name}</td><td className="r">{num(p.stok_rusak)} {p.base_unit}</td>{d.bolehLaba && <td className="r">{rp(p.nilai)}</td>}</tr>)}
                  </tbody>
                </table>
              )}
              {d.rusak.keluar.length > 0 && (
                <table style={{ marginTop: 10 }}>
                  <thead><tr><th>Di rentang ini</th><th className="r">Dibuang</th><th className="r">Dijual</th><th className="r">Ke supplier</th>{d.bolehLaba && <th className="r">Kerugian</th>}</tr></thead>
                  <tbody>
                    {d.rusak.keluar.map((p) => (
                      <tr key={p.id}><td>{p.name}</td><td className="r">{num(p.dibuang)}</td><td className="r">{num(p.dijual)}</td><td className="r">{num(p.dikembalikan)}</td>{d.bolehLaba && <td className="r">{rp(p.nilai_dibuang)}</td>}</tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <PergerakanStok produk={produk} from={d.from} to={d.to} />
          {d.bolehLaba && <RiwayatHargaBeli produk={produk} />}
        </>
      )}
    </div>
  );
}

function TabelLaris({ rows }) {
  return (
    <table>
      <thead><tr><th>Produk</th><th className="r">Jumlah</th><th className="r">Omset</th></tr></thead>
      <tbody>
        {rows.map((t) => <tr key={t.product_id}><td>{t.product_name}</td><td className="r">{num(t.qty_dasar)} {t.base_unit}</td><td className="r">{rp(t.omset)}</td></tr>)}
        {!rows.length && <tr><td colSpan="3" className="muted">Belum ada penjualan.</td></tr>}
      </tbody>
    </table>
  );
}

// Pilih produk dari daftar (ketik untuk menyaring).
function PilihProduk({ produk, value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 360 }}>
      <option value="">— pilih produk —</option>
      {produk.map((p) => <option key={p.id} value={p.id}>{p.category} · {p.name}</option>)}
    </select>
  );
}

function PergerakanStok({ produk, from, to }) {
  const [pid, setPid] = useState('');
  const [vid, setVid] = useState('');
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!pid) return setD(null);
    fetch(`/api/reports/stok?product_id=${pid}&variant_id=${vid}&from=${from}&to=${to}`).then((r) => r.json()).then(setD);
  }, [pid, vid, from, to]);
  const p = produk.find((x) => String(x.id) === pid);
  const unit = d?.product.base_unit || '';
  return (
    <div className="card noprint">
      <h2>Pergerakan stok</h2>
      <div className="row">
        <div><label>Produk</label><PilihProduk produk={produk} value={pid} onChange={(v) => { setPid(v); setVid(''); }} /></div>
        {p && p.variants.length > 1 && (
          <div><label>Warna</label>
            <select value={vid} onChange={(e) => setVid(e.target.value)}>
              <option value="">Semua warna</option>
              {p.variants.map((v) => <option key={v.id} value={v.id}>{v.color || '-'}</option>)}
            </select>
          </div>
        )}
      </div>
      {d && (
        <>
          <p>
            Stok awal <strong>{num(d.awal.jual)} {unit}</strong>{d.awal.rusak > 0 && ` (rusak ${num(d.awal.rusak)})`} → akhir <strong>{num(d.akhir.jual)} {unit}</strong>{d.akhir.rusak > 0 && ` (rusak ${num(d.akhir.rusak)})`}.
            {' '}{Object.entries(d.ringkas).map(([k, v]) => `${d.rows.find((r) => r.jenis === k)?.label || k} ${v > 0 ? '+' : ''}${num(v)}`).join(' · ')}
          </p>
          <table>
            <thead><tr><th>Waktu</th><th>Jenis</th><th>Warna</th><th className="r">Stok jual</th><th className="r">Rusak</th><th className="r">Saldo</th><th>Keterangan</th></tr></thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.created_at.slice(5, 16).replace('T', ' ')}</td>
                  <td>{r.label}</td>
                  <td>{r.color || '-'}</td>
                  <td className="r">{r.kolom !== 'rusak' ? `${r.delta > 0 ? '+' : ''}${num(r.delta)}` : ''}</td>
                  <td className="r">{r.kolom === 'rusak' ? `${r.delta > 0 ? '+' : ''}${num(r.delta)}` : ''}</td>
                  <td className="r">{num(r.saldo_jual)}{r.saldo_rusak > 0 ? ` / ${num(r.saldo_rusak)}` : ''}</td>
                  <td className="muted">{r.note} • {r.oleh}</td>
                </tr>
              ))}
              {!d.rows.length && <tr><td colSpan="7" className="muted">Tidak ada perubahan stok di rentang ini.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function RiwayatHargaBeli({ produk }) {
  const [pid, setPid] = useState('');
  const [rows, setRows] = useState([]);
  const [unit, setUnit] = useState('');
  useEffect(() => {
    if (!pid) return setRows([]);
    fetch(`/api/reports/harga-beli?product_id=${pid}`).then((r) => r.json()).then((x) => {
      setRows(x);
      // Satuan beli yang paling sering dipakai jadi bawaan grafik.
      const n = {};
      for (const r of x) n[r.unit_name] = (n[r.unit_name] || 0) + 1;
      setUnit(Object.keys(n).sort((a, b) => n[b] - n[a])[0] || '');
    });
  }, [pid]);
  const units = useMemo(() => [...new Set(rows.map((r) => r.unit_name))], [rows]);
  const grafik = rows.filter((r) => r.unit_name === unit).map((r) => ({
    label: tglPendek(r.tanggal), nilai: Number(r.unit_cost), teks: `${r.tanggal}: ${rp(r.unit_cost)} per ${r.unit_name}${r.supplier ? ` (${r.supplier})` : ''}`,
  }));
  return (
    <div className="card noprint">
      <h2>Riwayat harga beli</h2>
      <div className="row">
        <div><label>Produk</label><PilihProduk produk={produk} value={pid} onChange={setPid} /></div>
        {units.length > 1 && (
          <div><label>Grafik untuk satuan</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>{units.map((u) => <option key={u}>{u}</option>)}</select>
          </div>
        )}
      </div>
      {pid && !rows.length && <p className="muted">Belum ada barang masuk untuk produk ini.</p>}
      {rows.length > 0 && (
        <>
          <p className="muted" style={{ marginBottom: 4 }}>Harga beli per {unit}</p>
          <GrafikGaris data={grafik} />
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>Tanggal terima</th><th>Supplier</th><th className="r">Jumlah</th><th className="r">Harga beli</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}><td>{r.tanggal}</td><td>{r.supplier || '-'}</td><td className="r">{num(r.qty)} {r.unit_name}</td><td className="r">{rp(r.unit_cost)} / {r.unit_name}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
