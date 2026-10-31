'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { num } from '@/lib/format';

// Input stok awal bertahap per kategori. Tiap baris disimpan sendiri begitu diisi (Enter atau pindah kolom),
// jadi pekerjaan bisa berhenti dan dilanjutkan besok. Baris yang sudah dihitung diberi tanda dan tanggal.
export default function StokAwal() {
  const [kemajuan, setKemajuan] = useState([]);
  const [kategori, setKategori] = useState('');
  const [produk, setProduk] = useState([]);
  const [isi, setIsi] = useState({}); // variant_id -> teks jumlah
  const [satuan, setSatuan] = useState({}); // product_id -> unit id (satuan jual yang dipakai menghitung)
  const [status, setStatus] = useState({}); // variant_id -> { ok, pesan }
  const [q, setQ] = useState('');
  const [sembunyikan, setSembunyikan] = useState(false);

  const muat = (k = kategori) => fetch(`/api/stok-awal?kategori=${encodeURIComponent(k)}`).then((r) => r.json()).then((d) => {
    setKemajuan(d.kemajuan);
    setProduk(d.produk);
  });
  useEffect(() => { muat(''); }, []);
  useEffect(() => { if (kategori) muat(kategori); setIsi({}); setStatus({}); }, [kategori]);

  const unitOf = (p) => p.units.find((u) => String(u.id) === String(satuan[p.id])) || { name: p.base_unit, factor: 1 };

  async function simpan(p, v) {
    const teks = String(isi[v.id] ?? '').replace(',', '.').trim();
    if (teks === '') return;
    const qty = Number(teks);
    if (!(qty >= 0)) return setStatus((s) => ({ ...s, [v.id]: { ok: false, pesan: 'Angka tidak valid' } }));
    const u = unitOf(p);
    setStatus((s) => ({ ...s, [v.id]: { ok: true, pesan: 'Menyimpan…' } }));
    const r = await fetch('/api/stok-awal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant_id: v.id, qty, factor: u.factor }),
    });
    const d = await r.json();
    if (!r.ok) return setStatus((s) => ({ ...s, [v.id]: { ok: false, pesan: d.error } }));
    setStatus((s) => ({ ...s, [v.id]: { ok: true, pesan: `Tersimpan ${num(d.sesudah)} ${p.base_unit}` } }));
    setIsi((x) => ({ ...x, [v.id]: '' }));
    // Perbarui baris dan kemajuan tanpa memuat ulang seluruh tabel.
    setProduk((list) => list.map((x) => (x.id !== p.id ? x : { ...x, variants: x.variants.map((y) => (y.id === v.id ? { ...y, stock: d.sesudah, stok_awal_pada: d.stok_awal_pada } : y)) })));
    if (!v.stok_awal_pada) setKemajuan((k) => k.map((x) => (x.category === kategori ? { ...x, dihitung: Number(x.dihitung) + 1 } : x)));
  }

  const kini = kemajuan.find((k) => k.category === kategori);
  const shown = produk
    .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    .map((p) => ({ ...p, variants: sembunyikan ? p.variants.filter((v) => !v.stok_awal_pada) : p.variants }))
    .filter((p) => p.variants.length);

  return (
    <>
      <h1>Stok awal</h1>
      <p className="muted">Hitung fisik per warna lalu ketik jumlahnya. Stok diganti dengan hasil hitungan dan selisihnya dicatat sebagai koreksi &quot;stok awal&quot;. <Link href="/stok">← Stok</Link></p>
      <div className="card">
        <h2>Kemajuan</h2>
        <table>
          <tbody>
            {kemajuan.map((k) => (
              <tr key={k.category} style={{ cursor: 'pointer', fontWeight: k.category === kategori ? 700 : undefined }} onClick={() => setKategori(k.category)}>
                <td>{k.category}</td>
                <td className="r">{num(k.dihitung)} dari {num(k.warna)} warna sudah dihitung</td>
                <td style={{ width: '40%' }}>
                  <div style={{ background: 'var(--line)', borderRadius: 4, height: 8 }}>
                    <div style={{ background: 'var(--brand)', borderRadius: 4, height: 8, width: `${(100 * k.dihitung) / Math.max(1, k.warna)}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card row">
        <div><label>Kategori</label>
          <select value={kategori} onChange={(e) => setKategori(e.target.value)}>
            <option value="">— pilih kategori —</option>
            {kemajuan.map((k) => <option key={k.category} value={k.category}>{k.category}</option>)}
          </select>
        </div>
        <div><label>Cari produk</label><input value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div><label><input type="checkbox" style={{ width: 'auto' }} checked={sembunyikan} onChange={(e) => setSembunyikan(e.target.checked)} /> Sembunyikan yang sudah dihitung</label></div>
      </div>

      {kini && <p><strong>{kini.category}: {num(kini.dihitung)} dari {num(kini.warna)} warna sudah dihitung.</strong></p>}

      {shown.map((p) => {
        const u = unitOf(p);
        return (
          <div className="card" key={p.id}>
            <div className="row" style={{ alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>{p.name}</h2>
              <div>
                <label>Hitung dalam</label>
                <select value={satuan[p.id] ?? ''} onChange={(e) => setSatuan({ ...satuan, [p.id]: e.target.value })}>
                  <option value="">{p.base_unit}</option>
                  {p.units.filter((x) => x.factor !== 1).map((x) => <option key={x.id} value={x.id}>{x.name} ({num(x.factor)} {p.base_unit})</option>)}
                </select>
              </div>
            </div>
            <table>
              <thead><tr><th>Warna</th><th className="r">Stok sistem</th><th>Hitungan ({u.name})</th><th>Keadaan</th></tr></thead>
              <tbody>
                {p.variants.map((v) => {
                  const st = status[v.id];
                  const teks = String(isi[v.id] ?? '').replace(',', '.');
                  return (
                    <tr key={v.id}>
                      <td>{v.color || '-'}</td>
                      <td className="r">{num(v.stock)} {p.base_unit}</td>
                      <td>
                        <input inputMode="decimal" style={{ width: 100 }} value={isi[v.id] ?? ''}
                          onChange={(e) => setIsi({ ...isi, [v.id]: e.target.value })}
                          onBlur={() => simpan(p, v)}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                        {teks !== '' && u.factor !== 1 && Number(teks) >= 0 && <span className="muted"> = {num(Number(teks) * u.factor)} {p.base_unit}</span>}
                      </td>
                      <td>
                        {st ? <span className={st.ok ? 'muted' : ''} style={st.ok ? undefined : { color: 'var(--red)' }}>{st.pesan}</span>
                          : v.stok_awal_pada ? <span className="badge ok">✓ {v.stok_awal_pada.slice(0, 10)}</span>
                          : <span className="muted">belum</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      {kategori && !shown.length && <p className="muted">Tidak ada warna yang ditampilkan.</p>}
    </>
  );
}
