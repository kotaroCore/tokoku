'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { num, rp } from '@/lib/format';
import { boleh } from '@/lib/izin';
import { useMe } from '../me';

const LABEL = { ok: 'Aman', green: 'Mulai menipis', yellow: 'Waspada', red: 'Kritis', none: '-' };
const DOMPET_LABEL = { laci: 'Laci', receh: 'Receh', kulakan: 'Kulakan' };

export default function Cek() {
  const bolehModal = boleh(useMe(), 'ubah_modal');
  const [pending, setPending] = useState([]);
  const [stock, setStock] = useState([]);
  const [q, setQ] = useState('');
  const [input, setInput] = useState({}); // `${product_id}:${variant_id}` -> teks
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [titipLama, setTitipLama] = useState([]);
  const [menunggu, setMenunggu] = useState([]);
  // Cek sore harian (langkah 2-4)
  const [harian, setHarian] = useState({ sistem: {}, draf: [], lembar50: '', lembar100: '', mutasiEwallet: '', mutasiTransfer: '' });
  // Dompet
  const [dompet, setDompet] = useState({ saldo: {}, mutasi: [] });
  const [keluar, setKeluar] = useState({ dompet: 'laci', jumlah: '', keterangan: '' });
  const [hitung, setHitung] = useState({ dompet: 'laci', fisik: '' });
  // Hutang (langkah 6) dan harga (langkah 7)
  const [hutang, setHutang] = useState({ jumlah: 0, total: 0, lewatNota: 0, lewatTotal: 0 });
  const [alerts, setAlerts] = useState([]);

  const load = () => {
    fetch('/api/cek-sore').then((r) => r.json()).then(setPending);
    fetch('/api/stock').then((r) => r.json()).then(setStock);
    fetch('/api/saldo?stale=1').then((r) => r.json()).then(setTitipLama);
    fetch('/api/sales?menunggu=1').then((r) => r.json()).then(setMenunggu);
    fetch('/api/cek-sore/harian').then((r) => r.json()).then((d) => {
      setHarian((h) => ({
        ...h,
        sistem: d.sistem,
        draf: d.draf,
        lembar50: d.catat ? String(d.catat.lembar50 ?? '') : h.lembar50,
        lembar100: d.catat ? String(d.catat.lembar100 ?? '') : h.lembar100,
        mutasiEwallet: d.catat ? String(d.catat.mutasi_ewallet ?? '') : h.mutasiEwallet,
        mutasiTransfer: d.catat ? String(d.catat.mutasi_transfer ?? '') : h.mutasiTransfer,
      }));
    });
    fetch('/api/dompet').then((r) => r.json()).then(setDompet);
    fetch('/api/debts').then((r) => r.json()).then(({ rows }) => setHutang({
      jumlah: rows.length, total: rows.reduce((s, c) => s + c.total_hutang, 0),
      lewatNota: rows.reduce((s, c) => s + c.lewat_nota, 0), lewatTotal: rows.reduce((s, c) => s + c.lewat_tempo, 0),
    }));
    fetch('/api/harga-alert').then((r) => r.json()).then(setAlerts);
  };
  useEffect(() => { load(); }, []);

  const key = (p, v) => `${p.product_id}:${v.id}`;
  const val = (p, v) => Number(String(input[key(p, v)] || '').replace(',', '.')) || 0;
  const sumOf = (p) => p.variants.reduce((s, v) => s + val(p, v), 0);

  async function post(url, body) {
    setMsg(''); setErr('');
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { setErr(d.error); return null; }
    load();
    return d;
  }

  async function submit(p) {
    const allocations = p.variants.map((v) => ({ variant_id: v.id, qty: val(p, v) })).filter((a) => a.qty > 0);
    const d = await post('/api/cek-sore', { product_id: p.product_id, allocations });
    if (d) setMsg(`${p.product_name}: stok sudah dikoreksi.`);
  }

  async function simpanHarian() {
    const d = await post('/api/cek-sore/harian', {
      lembar50: Number(harian.lembar50) || 0,
      lembar100: Number(harian.lembar100) || 0,
      mutasi_ewallet: Number(harian.mutasiEwallet) || 0,
      mutasi_transfer: Number(harian.mutasiTransfer) || 0,
    });
    if (d) setMsg('Hitungan cek sore hari ini disimpan.');
  }

  async function keluarkan() {
    const d = await post('/api/dompet', { dompet: keluar.dompet, jumlah: Number(keluar.jumlah), keterangan: keluar.keterangan });
    if (d) { setMsg('Pengeluaran dicatat.'); setKeluar({ ...keluar, jumlah: '', keterangan: '' }); }
  }

  async function hitungDompet() {
    const d = await post('/api/dompet/hitung', { dompet: hitung.dompet, fisik: Number(hitung.fisik) });
    if (d) {
      setMsg(d.selisih ? `Selisih ${DOMPET_LABEL[hitung.dompet]}: ${d.selisih > 0 ? '+' : ''}${rp(d.selisih)} (sistem ${rp(d.sistem)}).` : `${DOMPET_LABEL[hitung.dompet]} sesuai sistem.`);
      setHitung({ ...hitung, fisik: '' });
    }
  }

  async function tutupAlert(id) {
    const r = await fetch('/api/harga-alert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, aksi: 'tidak_perlu' }) });
    if (!r.ok) return setErr((await r.json()).error);
    load();
  }

  const shown = stock.filter((v) => `${v.product_name} ${v.color} ${v.category}`.toLowerCase().includes(q.toLowerCase()));
  // Langkah 5: warna laris (hitam, putih, natural) dan barang kuning atau merah.
  const perluDilihat = stock.filter((v) => v.status === 'yellow' || v.status === 'red' || /hitam|putih|natural/i.test(v.color || ''));
  const selisihEwallet = Number(harian.mutasiEwallet || 0) - (harian.sistem.ewallet || 0);
  const selisihTransfer = Number(harian.mutasiTransfer || 0) - (harian.sistem.transfer || 0);

  return (
    <>
      <h1>Cek</h1>
      {msg && <div className="alert ok">{msg}</div>}
      {err && <div className="alert err">{err}</div>}

      <div className="card">
        <h2>1. Warna belum diinput</h2>
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
        <h2>2. Nota draf hari ini</h2>
        {!harian.draf.length ? <p className="muted">Tidak ada (normalnya kosong).</p> : (
          <>
            <p className="muted">Selesaikan atau batalkan sebelum tutup toko.</p>
            <table>
              <thead><tr><th>Nota</th><th>Pembeli</th><th className="r">Total</th><th>Keadaan</th></tr></thead>
              <tbody>
                {harian.draf.map((n) => (
                  <tr key={n.id}>
                    <td>{n.nomor}</td><td>{n.customer_name || '-'}</td><td className="r">{rp(n.total + n.pembulatan)}</td>
                    <td>{n.menunggu_sejak ? 'Menunggu konfirmasi' : 'Draf'} <Link href="/riwayat">buka di Riwayat</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card">
        <h2>3. Lembaran uang dan pembulatan</h2>
        <div className="row">
          <div className="field"><label>Lembar Rp 50.000</label><input inputMode="numeric" value={harian.lembar50} onChange={(e) => setHarian({ ...harian, lembar50: e.target.value })} /></div>
          <div className="field"><label>Lembar Rp 100.000</label><input inputMode="numeric" value={harian.lembar100} onChange={(e) => setHarian({ ...harian, lembar100: e.target.value })} /></div>
        </div>
        <p className="muted">Total pembulatan hari ini (sistem): <strong>{rp(harian.sistem.pembulatan || 0)}</strong></p>
      </div>

      <div className="card">
        <h2>4. E-wallet dan transfer dicocokkan dengan mutasi</h2>
        <table>
          <thead><tr><th>Metode</th><th className="r">Menurut sistem</th><th className="r">Menurut mutasi</th><th className="r">Selisih</th></tr></thead>
          <tbody>
            <tr>
              <td>E-wallet</td><td className="r">{rp(harian.sistem.ewallet || 0)}</td>
              <td className="r"><input style={{ width: 120 }} inputMode="numeric" value={harian.mutasiEwallet} onChange={(e) => setHarian({ ...harian, mutasiEwallet: e.target.value })} /></td>
              <td className="r">{harian.mutasiEwallet === '' ? '-' : rp(selisihEwallet)}</td>
            </tr>
            <tr>
              <td>Transfer</td><td className="r">{rp(harian.sistem.transfer || 0)}</td>
              <td className="r"><input style={{ width: 120 }} inputMode="numeric" value={harian.mutasiTransfer} onChange={(e) => setHarian({ ...harian, mutasiTransfer: e.target.value })} /></td>
              <td className="r">{harian.mutasiTransfer === '' ? '-' : rp(selisihTransfer)}</td>
            </tr>
          </tbody>
        </table>
        <p>
          <button onClick={simpanHarian}>Simpan hitungan cek sore</button>
        </p>
        {!menunggu.length ? <p className="muted">Tidak ada pembayaran yang menunggu konfirmasi.</p> : (
          <>
            <p className="muted">Pembayaran menunggu konfirmasi. Konfirmasi lewat Riwayat; barang belum boleh diserahkan sebelum dana masuk.</p>
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
        <h2>Dompet</h2>
        <div className="row">
          {Object.entries(DOMPET_LABEL).map(([k, label]) => (
            <div className="card stat" key={k}><div className="v">{rp(dompet.saldo[k] || 0)}</div><div className="l">{label} (sistem)</div></div>
          ))}
        </div>
        <h3>Uang keluar</h3>
        <div className="row">
          <div className="field"><label>Dari dompet</label>
            <select value={keluar.dompet} onChange={(e) => setKeluar({ ...keluar, dompet: e.target.value })}>
              {Object.entries(DOMPET_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div className="field"><label>Jumlah (Rp)</label><input inputMode="numeric" value={keluar.jumlah} onChange={(e) => setKeluar({ ...keluar, jumlah: e.target.value })} /></div>
          <div className="field"><label>Untuk apa</label><input value={keluar.keterangan} onChange={(e) => setKeluar({ ...keluar, keterangan: e.target.value })} placeholder="mis. jamu, GoSend" /></div>
        </div>
        <p><button className="secondary" onClick={keluarkan}>Catat pengeluaran</button></p>
        <h3>Hitung fisik</h3>
        <div className="row">
          <div className="field"><label>Dompet</label>
            <select value={hitung.dompet} onChange={(e) => setHitung({ ...hitung, dompet: e.target.value })}>
              {Object.entries(DOMPET_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div className="field"><label>Jumlah yang dihitung (Rp)</label><input inputMode="numeric" value={hitung.fisik} onChange={(e) => setHitung({ ...hitung, fisik: e.target.value })} /></div>
        </div>
        <p className="muted">Dihitung seminggu sekali untuk laci. Selisih terhadap sistem dicatat, tidak dihapus.</p>
        <p><button className="secondary" onClick={hitungDompet}>Catat hitungan</button></p>
      </div>

      <div className="card">
        <h2>5. Stok warna laris dan barang kuning atau merah</h2>
        {!perluDilihat.length ? <p className="muted">Aman.</p> : (
          <table>
            <thead><tr><th>Produk</th><th>Warna</th><th className="r">Stok</th><th>Status</th></tr></thead>
            <tbody>
              {perluDilihat.map((v) => (
                <tr key={v.id}>
                  <td>{v.product_name}</td><td>{v.color || '-'}</td>
                  <td className="r">{num(v.stock)} {v.base_unit}</td>
                  <td><span className={`badge ${v.status}`}>{LABEL[v.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>6. Hutang pembeli</h2>
        <p>{hutang.jumlah > 0 ? <>{hutang.jumlah} pembeli, total <strong>{rp(hutang.total)}</strong>. </> : 'Tidak ada hutang. '}<Link href="/hutang">Buka daftar hutang</Link></p>
        {hutang.lewatNota > 0 && <p><span className="badge red">{hutang.lewatNota} nota lewat jatuh tempo hari ini, {rp(hutang.lewatTotal)}</span> Kirim pengingat dari daftar hutang.</p>}
      </div>

      <div className="card">
        <h2>7. Harga beli yang belum ditangani</h2>
        {!alerts.length ? <p className="muted">Tidak ada.</p> : (
          <>
            <p className="muted">Admin menutupnya di halaman Barang masuk (Ubah harga atau Tidak perlu).</p>
            {alerts.map((h) => (
              <div key={h.id} style={{ marginBottom: 6 }}>
                {h.product_name}: {rp(h.lama)} → {rp(h.baru)} per {h.base_unit}
                {bolehModal && <>{' '}<button className="secondary" onClick={() => tutupAlert(h.id)}>{h.modal_diubah ? 'Tidak perlu' : 'Tetap harga beli lama'}</button></>}
              </div>
            ))}
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
                <td className="r">{num(v.stock)} {v.base_unit}{v.stok_rusak > 0 && <div className="muted">rusak {num(v.stok_rusak)}</div>}</td>
                <td><span className={`badge ${v.status}`}>{LABEL[v.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
