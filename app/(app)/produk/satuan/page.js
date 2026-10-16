'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { num } from '@/lib/format';

const blank = { id: null, name: '', factor: '', base_unit: '' };

// Kelola pilihan satuan jual yang muncul di listbox form produk.
export default function SatuanPilihan() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [f, setF] = useState(null);
  const [err, setErr] = useState('');

  const load = () => fetch('/api/unit-presets').then((r) => r.json()).then(setRows);
  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    setErr('');
    const r = await fetch('/api/unit-presets', {
      method: f.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
    });
    const d = await r.json();
    if (!r.ok) return setErr(d.error);
    setF(null);
    load();
  }

  async function del(u) {
    if (!confirm(`Hapus satuan "${u.name}" dari daftar pilihan? Produk yang sudah memakainya tidak berubah.`)) return;
    await fetch('/api/unit-presets', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: u.id }) });
    load();
  }

  return (
    <>
      <h1>Pilihan satuan jual</h1>
      <p className="muted">Daftar ini muncul di listbox Satuan pada form produk. Faktor = jumlah satuan dasar dalam satu satuan (dosin = 12). "Berlaku untuk" membatasi satuan ini hanya muncul pada produk dengan satuan dasar tersebut (yard = 0,9 hanya untuk meter); kosongkan bila berlaku untuk semua. Kosongkan faktor bila isinya beda-beda tiap produk (mis. paket).</p>
      <div className="card row">
        <div><button onClick={() => { setF(f ? null : { ...blank }); setErr(''); }}>{f ? 'Tutup' : '+ Satuan baru'}</button></div>
        <div><button className="secondary" onClick={() => router.push('/produk')}>Kembali ke produk</button></div>
      </div>

      {f && (
        <form className="card" onSubmit={save}>
          <h2>{f.id ? 'Ubah satuan' : 'Satuan baru'}</h2>
          <div className="row">
            <div className="field"><label>Nama satuan</label><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="field"><label>Berlaku untuk satuan dasar (kosong = semua)</label>
              <input list="bases" value={f.base_unit || ''} placeholder="biji / meter" onChange={(e) => setF({ ...f, base_unit: e.target.value })} />
              <datalist id="bases">{[...new Set(['biji', 'meter', 'buah', ...rows.map((r) => r.base_unit).filter(Boolean)])].map((b) => <option key={b} value={b} />)}</datalist>
            </div>
            <div className="field"><label>Faktor bawaan (opsional)</label><input inputMode="decimal" value={f.factor ?? ''} onChange={(e) => setF({ ...f, factor: e.target.value })} /></div>
          </div>
          {err && <div className="alert err">{err}</div>}
          <button>Simpan</button>
        </form>
      )}

      <div className="card">
        <table>
          <thead><tr><th>Satuan</th><th>Berlaku untuk</th><th>Faktor bawaan</th><th></th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.base_unit || <span className="muted">semua</span>}</td>
                <td>{u.factor == null ? <span className="muted">diisi manual</span> : num(u.factor)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="secondary" onClick={() => { setF({ ...u }); setErr(''); }}>Ubah</button>{' '}
                  <button className="secondary" onClick={() => del(u)}>Hapus</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="muted">Belum ada satuan. Tambah dulu, mis. biji (1), dosin (12), gross (144).</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
