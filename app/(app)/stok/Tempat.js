'use client';
import { useEffect, useState } from 'react';
import { num } from '@/lib/format';
import Modal from '../Modal';

export const MAKS_TEMPAT = 3;

// Ringkasan tempat penyimpanan satu warna: "Toko A: 10 · Gudang: 5".
export function DaftarTempat({ tempat, unit = '' }) {
  if (!tempat?.length) return <span className="muted">-</span>;
  return tempat.map((t, i) => (
    <div key={t.urutan} style={{ whiteSpace: 'nowrap' }}>{i + 1}. {t.lokasi}: {num(t.qty)}{unit && ` ${unit}`}</div>
  ));
}

// Atur tempat penyimpanan (maks. 3) dan stok tiap tempat. Nama tempat diketik bebas (daftar lokasi hanya saran).
// Stok tempat 1 dihitung otomatis = stok warna dikurangi tempat 2 dan 3, jadi total tetap sama.
// Penjualan mengambil dari tempat 1 dulu, lalu 2, lalu 3.
export function TempatEditor({ v, onClose, onSaved }) {
  const [baris, setBaris] = useState(() => {
    const b = (v.tempat || []).map((t) => ({ lokasi: t.lokasi, qty: String(t.qty) }));
    return b.length ? b : [{ lokasi: v.lokasi_rak || '', qty: '' }];
  });
  const [saran, setSaran] = useState([]);
  const [err, setErr] = useState('');
  useEffect(() => { fetch('/api/lokasi').then((r) => r.json()).then(setSaran); }, []);

  const angka = (s) => Number(String(s).replace(',', '.')) || 0;
  const lain = baris.slice(1).reduce((t, b) => t + angka(b.qty), 0);
  const tempat1 = v.stock - lain;
  const set = (i, k, val) => setBaris(baris.map((b, j) => (j === i ? { ...b, [k]: val } : b)));

  async function simpan() {
    setErr('');
    if (tempat1 < -1e-9) return setErr(`Stok tempat 2 dan 3 (${num(lain)}) melebihi stok warna (${num(v.stock)}).`);
    const isi = baris.filter((b) => b.lokasi.trim());
    if (baris.some((b, i) => i > 0 && !b.lokasi.trim() && angka(b.qty))) return setErr('Isi nama tempat untuk setiap stok.');
    const r = await fetch('/api/lokasi', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant_id: v.id, tempat: isi.map((b) => ({ lokasi: b.lokasi, qty: angka(b.qty) })) }),
    });
    const d = await r.json();
    if (!r.ok) return setErr(d.error);
    onSaved();
  }

  return (
    <Modal title={`Tempat penyimpanan ${v.product_name} ${v.color || ''}`} onClose={onClose}>
      <p className="muted">Stok warna ini {num(v.stock)} {v.base_unit}. Maksimal {MAKS_TEMPAT} tempat. Stok tempat 1 dihitung otomatis; barang terjual diambil dari tempat 1 dulu, lalu 2, lalu 3. Kosongkan nama untuk menghapus tempat.</p>
      <datalist id="saran-lokasi">{saran.map((l) => <option key={l.id} value={l.label} />)}</datalist>
      <table>
        <thead><tr><th>#</th><th>Tempat (ketik bebas)</th><th>Stok ({v.base_unit})</th><th></th></tr></thead>
        <tbody>
          {baris.map((b, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td><input list="saran-lokasi" value={b.lokasi} maxLength={50} placeholder="mis. Toko rak depan" onChange={(e) => set(i, 'lokasi', e.target.value)} /></td>
              <td>
                {i === 0
                  ? <strong style={tempat1 < 0 ? { color: 'var(--red)' } : undefined}>{num(tempat1)}</strong>
                  : <input inputMode="decimal" style={{ width: 90 }} value={b.qty} onChange={(e) => set(i, 'qty', e.target.value)} />}
              </td>
              <td>{baris.length > 1 && <button type="button" className="secondary" onClick={() => setBaris(baris.filter((_, j) => j !== i))}>Hapus</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {baris.length < MAKS_TEMPAT && <button type="button" className="secondary" style={{ marginTop: 6 }} onClick={() => setBaris([...baris, { lokasi: '', qty: '' }])}>+ Tempat</button>}
      {err && <div className="alert err">{err}</div>}
      <div style={{ marginTop: 10 }}><button onClick={simpan}>Simpan</button></div>
    </Modal>
  );
}
