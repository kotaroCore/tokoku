'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { num } from '@/lib/format';

const kosong = () => ({ lokasi: '', qty: '' });

// Stok opname per warna: pilih satu warna, ketik jumlah fisik di setiap tempat warna itu disimpan
// (satu warna bisa ada di beberapa rak dengan jumlah berbeda). Total dibandingkan dengan stok sistem;
// selisih tampil sebelum disimpan dan dicatat sebagai koreksi dengan alasan.
export default function Opname() {
  const [stock, setStock] = useState([]);
  const [lokasi, setLokasi] = useState([]);
  const [riwayat, setRiwayat] = useState([]);
  const [q, setQ] = useState('');
  const [v, setV] = useState(null); // warna terpilih (dari /api/opname?variant_id)
  const [baris, setBaris] = useState([kosong()]);
  const [alasan, setAlasan] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const loadRiwayat = () => fetch('/api/opname').then((r) => r.json()).then(setRiwayat);
  useEffect(() => {
    fetch('/api/stock').then((r) => r.json()).then(setStock);
    fetch('/api/lokasi').then((r) => r.json()).then(setLokasi);
    loadRiwayat();
  }, []);

  const matches = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return stock.filter((x) => words.every((w) => `${x.product_name} ${x.color} ${x.lokasi_rak || ''}`.toLowerCase().includes(w))).slice(0, 15);
  }, [q, stock]);

  async function pilih(id) {
    setErr(''); setMsg(''); setAlasan(''); setQ('');
    const d = await fetch(`/api/opname?variant_id=${id}`).then((r) => r.json());
    setV(d);
    // Tempat yang diketahui: lokasi utama dan lokasi di opname terakhir warna ini.
    const tempat = [...new Set([d.lokasi_rak, ...d.lokasi_terakhir].filter(Boolean))];
    setBaris(tempat.length ? tempat.map((l) => ({ lokasi: l, qty: '' })) : [kosong()]);
  }

  const angka = (s) => Number(String(s).replace(',', '.'));
  const terisi = baris.filter((b) => String(b.qty).trim() !== '');
  const fisik = terisi.reduce((t, b) => t + (angka(b.qty) || 0), 0);
  const selisih = v ? Math.round((fisik - v.stock) * 1e6) / 1e6 : 0;

  async function simpan() {
    setErr('');
    if (!terisi.length) return setErr('Isi jumlah fisik minimal satu tempat (0 bila kosong).');
    if (terisi.some((b) => !(angka(b.qty) >= 0))) return setErr('Jumlah fisik tidak valid.');
    if (selisih && !alasan.trim()) return setErr('Ada selisih: isi alasannya.');
    const r = await fetch('/api/opname', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant_id: v.id, items: terisi.map((b) => ({ lokasi: b.lokasi, qty: angka(b.qty) })), alasan }),
    });
    const d = await r.json();
    if (!r.ok) return setErr(d.error);
    setMsg(`${v.product_name} ${v.color}: fisik ${num(d.jumlah_fisik)} ${v.base_unit}, ${d.selisih ? `selisih ${d.selisih > 0 ? '+' : ''}${num(d.selisih)} dicatat sebagai koreksi` : 'sesuai sistem'}.`);
    setV(null);
    fetch('/api/stock').then((x) => x.json()).then(setStock);
    loadRiwayat();
  }

  return (
    <>
      <h1>Stok opname per warna</h1>
      <p className="muted">Pilih satu warna, lalu ketik jumlah fisik di semua tempat warna itu disimpan. Stok tetap satu angka per warna; lokasi hanya untuk mencari barang. <Link href="/stok">← Stok</Link> · <Link href="/stok/lokasi">Daftar lokasi</Link></p>
      {msg && <div className="alert ok">{msg}</div>}

      <div className="card">
        <div className="field" style={{ position: 'relative' }}>
          <label>Cari warna (nama produk, warna, atau lokasi)</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="mis. yamalaon hitam" />
          {matches.length > 0 && (
            <div className="suggest">
              {matches.map((x) => (
                <div key={x.id} onClick={() => pilih(x.id)}>
                  {x.product_name} — {x.color || '-'} <span className="muted">({num(x.stock)} {x.base_unit}{x.lokasi_rak ? ` • ${x.lokasi_rak}` : ''})</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {v && (
          <>
            <h2>{v.product_name} — {v.color || '-'}</h2>
            <p>Stok sistem: <strong>{num(v.stock)} {v.base_unit}</strong>{v.lokasi_rak && <span className="muted"> • lokasi utama {v.lokasi_rak}</span>}</p>
            <datalist id="lokasi-list">{lokasi.map((l) => <option key={l.id} value={l.label} />)}</datalist>
            <table>
              <thead><tr><th>Tempat / lokasi</th><th>Jumlah fisik ({v.base_unit})</th><th></th></tr></thead>
              <tbody>
                {baris.map((b, i) => (
                  <tr key={i}>
                    <td><input list="lokasi-list" value={b.lokasi} placeholder="mis. Toko / Lemari A / Rak 2" onChange={(e) => setBaris(baris.map((x, j) => (j === i ? { ...x, lokasi: e.target.value } : x)))} /></td>
                    <td><input inputMode="decimal" style={{ width: 110 }} value={b.qty} onChange={(e) => setBaris(baris.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} /></td>
                    <td>{baris.length > 1 && <button type="button" className="secondary" onClick={() => setBaris(baris.filter((_, j) => j !== i))}>Hapus</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="secondary" style={{ marginTop: 6 }} onClick={() => setBaris([...baris, kosong()])}>+ Tempat lain</button>
            <div className="alert" style={{ marginTop: 10 }}>
              Total fisik <strong>{num(fisik)}</strong> • sistem {num(v.stock)} • selisih{' '}
              <strong style={selisih ? { color: 'var(--red)' } : undefined}>{selisih > 0 ? '+' : ''}{num(selisih)} {v.base_unit}</strong>
              {selisih !== 0 && <span className="muted"> (disimpan sebagai koreksi stok)</span>}
            </div>
            {selisih !== 0 && (
              <div className="field"><label>Alasan selisih (wajib)</label><input value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. salah warna saat jual, hilang, salah hitung sebelumnya" /></div>
            )}
            {err && <div className="alert err">{err}</div>}
            <button onClick={simpan}>Simpan opname</button>{' '}
            <button className="secondary" onClick={() => setV(null)}>Batal</button>
          </>
        )}
      </div>

      <div className="card">
        <h2>Riwayat opname</h2>
        <table>
          <thead><tr><th>Tanggal</th><th>Warna</th><th>Oleh</th><th className="r">Sistem</th><th className="r">Fisik</th><th className="r">Selisih</th><th>Tempat / alasan</th></tr></thead>
          <tbody>
            {riwayat.map((o) => (
              <tr key={o.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{o.dibuat_pada.slice(0, 16).replace('T', ' ')}</td>
                <td>{o.product_name} {o.color}</td>
                <td>{o.oleh}</td>
                <td className="r">{num(o.stok_sistem)}</td>
                <td className="r">{num(o.jumlah_fisik)}</td>
                <td className="r">{o.selisih > 0 ? '+' : ''}{num(o.selisih)}</td>
                <td className="muted">{o.items.map((i) => `${i.lokasi || '-'}: ${num(i.qty)}`).join(', ')}{o.alasan && ` • ${o.alasan}`}</td>
              </tr>
            ))}
            {!riwayat.length && <tr><td colSpan="7" className="muted">Belum ada opname.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
