'use client';
import { useMemo, useState } from 'react';
import { rp, num } from '@/lib/format';
import { boleh } from '@/lib/izin';
import { useMe } from '../me';

export const CATS = ['BENANG', 'FURING', 'RESLETING', 'BENIK', 'KAIN'];
// Pilihan satuan jual (listbox) diambil dari database (/api/unit-presets, dikelola di halaman Satuan).
// Judul paket (mis. "3 warna") diisi terpisah dan digabung ke nama satuan saat simpan.
const blankUnit = (presets = []) => ({ unit: presets[0]?.name || '', title: '', factor: presets[0]?.factor != null ? String(presets[0].factor) : '', price: '' });
const fullName = (u) => [u.unit, u.title.trim()].filter(Boolean).join(' ');
// Pisahkan nama tersimpan ("paket 3 warna") menjadi satuan + judul; nama lama di luar daftar tetap jadi satuan sendiri.
function splitName(name, presets) {
  const hit = presets.find((o) => name === o.name || name.startsWith(o.name + ' '));
  return hit ? { unit: hit.name, title: name.slice(hit.name.length).trim() } : { unit: name, title: '' };
}
const blankVariant = () => ({ color: '', stock: '', level_green: '', level_yellow: '', level_red: '' });
export const blank = (presets) => ({ id: null, category: 'BENANG', name: '', base_unit: 'biji', cost: '', units: [blankUnit(presets)], variants: [blankVariant()] });

// Data produk dari API dijadikan isi form ubah.
export function toForm(p, presets) {
  return {
    last_buy: p.last_buy, id: p.id, category: p.category, name: p.name, base_unit: p.base_unit, cost: p.cost ? String(p.cost) : '',
    units: p.units.map((u) => ({ id: u.id, ...splitName(u.name, presets), factor: String(u.factor), price: String(u.price) })),
    variants: [],
  };
}

// Peringatan harga: satuan lebih besar seharusnya tidak lebih mahal per satuan dasar, dan harga jual tidak di bawah modal.
function unitWarnings(f) {
  const rows = f.units
    .map((u) => ({ name: fullName(u), factor: Number(u.factor), price: Number(u.price), raw: u.price }))
    .filter((u) => u.name && u.factor > 0 && u.raw !== '');
  const w = [];
  const sorted = [...rows].sort((a, b) => a.factor - b.factor);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (b.factor > a.factor && b.price / b.factor > a.price / a.factor) {
      w.push(`"${b.name}" lebih mahal per ${f.base_unit || 'satuan dasar'} (${rp(b.price / b.factor)}) daripada "${a.name}" (${rp(a.price / a.factor)}). Sudah benar?`);
    }
  }
  const cost = Number(f.cost);
  if (cost > 0) for (const u of rows) if (u.price < Math.round(cost * u.factor)) w.push(`Harga "${u.name}" ${rp(u.price)} di bawah modal ${rp(Math.round(cost * u.factor))}.`);
  return w;
}

// Daftar warna produk saat mode ubah: ubah nama, nonaktifkan/aktifkan, dan tambah warna baru.
function VariantTable({ productId, variants, onChanged }) {
  const [err, setErr] = useState('');

  async function call(method, body) {
    setErr('');
    const r = await fetch('/api/variants', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) setErr((await r.json()).error);
    onChanged();
  }

  const rename = (v) => {
    const color = prompt(`Ubah nama warna "${v.color}":`, v.color);
    if (color == null) return;
    call('PUT', { id: v.id, color });
  };
  const toggle = (v) => {
    if (v.active && !confirm(`Nonaktifkan warna "${v.color || '-'}"? Warna tidak muncul di kasir dan stok, riwayat nota tetap aman.`)) return;
    call('PATCH', { id: v.id, active: !v.active });
  };
  const add = () => {
    const color = prompt('Tambah warna/varian:');
    if (!color?.trim()) return;
    call('POST', { product_id: productId, color });
  };

  return (
    <>
      <h2 style={{ marginTop: 16 }}>Warna / varian</h2>
      <table>
        <thead><tr><th>Warna</th><th className="r">Stok</th><th>Level (H/K/M)</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {variants.map((v) => (
            <tr key={v.id} style={v.active ? undefined : { opacity: 0.5 }}>
              <td>{v.color || '-'}{!v.active && ' · NONAKTIF'}</td>
              <td className="r">{num(v.stock)}</td>
              <td>{v.level_green}/{v.level_yellow}/{v.level_red}</td>
              <td>{v.active ? 'Aktif' : 'Nonaktif'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button type="button" className="secondary" onClick={() => rename(v)}>Ubah</button>{' '}
                <button type="button" className="secondary" onClick={() => toggle(v)}>{v.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
              </td>
            </tr>
          ))}
          {!variants.length && <tr><td colSpan={5} className="muted">Belum ada warna.</td></tr>}
        </tbody>
      </table>
      {err && <div className="alert err">{err}</div>}
      <button type="button" className="secondary" style={{ marginTop: 8 }} onClick={add}>+ Warna</button>
    </>
  );
}

// inModal: judul sudah ditampilkan oleh pop up, jadi tidak diulang di dalam form.
export function ProductForm({ init, cats, presets, variants, onChanged, onDone, onCancel, inModal = false }) {
  const [f, setF] = useState(init);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const edit = !!f.id;
  const me = useMe();
  // Produk lama: harga satuan yang sudah ada dan modal terkunci bagi staf tanpa izin (API juga menolak).
  const kunciHarga = edit && !boleh(me, 'ubah_harga');
  const kunciModal = edit && !boleh(me, 'ubah_modal');
  const terkunci = (u) => kunciHarga && !!u.id;
  const warns = useMemo(() => unitWarnings(f), [f]);
  // Hanya satuan yang cocok dengan satuan dasar produk (atau yang berlaku untuk semua).
  const base = f.base_unit.trim().toLowerCase();
  const opts = presets.filter((o) => !o.base_unit || o.base_unit.toLowerCase() === base);

  const setUnit = (i, k, v) => setF({ ...f, units: f.units.map((u, j) => (j === i ? { ...u, [k]: v } : u)) });
  const setVar = (i, k, v) => setF({ ...f, variants: f.variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });

  async function save(e) {
    e.preventDefault();
    setErr('');
    const names = f.units.map((u) => fullName(u).toLowerCase());
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) return setErr(`Satuan "${dup}" muncul lebih dari sekali. Beri judul paket yang berbeda (mis. "setengah lusin") agar bisa dibedakan.`);
    setBusy(true);
    const body = { id: f.id, category: f.category, name: f.name, base_unit: f.base_unit, cost: f.cost, units: f.units.map((u) => ({ id: u.id, name: fullName(u), factor: u.factor, price: u.price })) };
    if (!edit) body.variants = f.variants.filter((v) => v.color.trim() || f.variants.length === 1);
    const r = await fetch('/api/products', {
      method: edit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error);
    onDone();
  }

  return (
    <form className="card" onSubmit={save}>
      {!inModal && <h2>{edit ? `Ubah produk: ${init.name}` : 'Produk baru'}</h2>}

      <section className="form-sec">
        <h2>Informasi produk</h2>
        <div className="row">
          <div className="field"><label>Kategori (pilih atau ketik baru)</label>
            <input required list="cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
            <datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="field"><label>Nama produk</label><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        </div>
        <div className="row">
          <div className="field"><label>Satuan dasar stok (biji / meter / buah)</label>
            <input required value={f.base_unit} onChange={(e) => setF({ ...f, base_unit: e.target.value })} /></div>
          <div className="field"><label>Harga beli / modal per {f.base_unit || 'satuan dasar'} (opsional)</label>
            <input inputMode="numeric" disabled={kunciModal} value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value, units: f.units.map((u) => ({ ...u, modalEdit: undefined })) })} /></div>
        </div>
        {(kunciHarga || kunciModal) && (
          <div className="alert" style={{ marginBottom: 8 }}>
            🔒 {kunciHarga && kunciModal ? 'Harga jual dan modal' : kunciHarga ? 'Harga jual satuan yang sudah ada' : 'Modal'} terkunci. Minta izin ke admin untuk mengubahnya. Satuan baru tetap boleh ditambah.
          </div>
        )}
        {f.last_buy && !kunciModal && (
          <div style={{ marginBottom: 8 }}>
            <button type="button" className="secondary" onClick={() => setF({ ...f, cost: String(Math.round((f.last_buy.unit_cost / f.last_buy.factor) * 100) / 100), units: f.units.map((u) => ({ ...u, modalEdit: undefined })) })}>
              Pakai harga nota terakhir
            </button>{' '}
            <span className="muted">{rp(f.last_buy.unit_cost)} per {f.last_buy.unit_name} ({String(f.last_buy.date).slice(0, 10)}) = {rp(f.last_buy.unit_cost / f.last_buy.factor)} per {f.base_unit}. Setelah dipakai, angka masih bisa diubah manual.</span>
          </div>
        )}
        <div className="muted" style={{ marginTop: -4 }}>Modal per satuan jual (dosin dll.) bisa diisi langsung di tiap baris satuan di bawah; modal per {f.base_unit || 'satuan dasar'} ikut terhitung.</div>
      </section>

      <section className="form-sec">
        <h2>Satuan jual &amp; harga</h2>
        <p className="muted">Faktor = jumlah satuan dasar dalam satu satuan jual (dosin = 12, gross = 144). Tiap satuan boleh punya harga sendiri. {!opts.length && <>Belum ada satuan untuk satuan dasar "{f.base_unit}". </>}<a href="/produk/satuan">Kelola daftar satuan</a></p>
        {f.units.map((u, i) => {
          const factor = Number(u.factor), price = Number(u.price);
          const per = factor > 0 && u.price !== '' ? price / factor : null;
          // Modal per satuan jual = modal per satuan dasar x faktor; boleh diketik langsung, modal dasar ikut dihitung.
          const modalDerived = Number(f.cost) > 0 && factor > 0 ? String(Math.round(Number(f.cost) * factor)) : '';
          const modalShown = u.modalEdit ?? modalDerived;
          const setModal = (v) => {
            const raw = v.replace(/[^0-9.,]/g, '').replace(',', '.');
            const cost = raw !== '' && factor > 0 ? String(Math.round((Number(raw) / factor) * 100) / 100) : '';
            setF({ ...f, cost, units: f.units.map((x, j) => ({ ...x, modalEdit: j === i ? raw : undefined })) });
          };
          return (
            <div className="unit-row" key={i}>
              <div className="field"><label>Satuan</label>
                <select required disabled={terkunci(u)} value={u.unit} onChange={(e) => {
                  const o = presets.find((x) => x.name === e.target.value);
                  setF({ ...f, units: f.units.map((x, j) => (j === i ? { ...x, unit: e.target.value, factor: o?.factor != null ? String(o.factor) : x.factor } : x)) });
                }}>
                  <option value="">— pilih satuan —</option>
                  {u.unit && !opts.some((o) => o.name === u.unit) && <option value={u.unit}>{u.unit}</option>}
                  {opts.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Judul paket (opsional)</label>
                <input value={u.title} placeholder="mis. 3 warna" onChange={(e) => setUnit(i, 'title', e.target.value)} />
              </div>
              <div className="field"><label>Faktor</label><input required inputMode="decimal" disabled={terkunci(u)} value={u.factor} onChange={(e) => setUnit(i, 'factor', e.target.value)} /></div>
              <div className="field"><label>Harga modal</label>
                <input inputMode="numeric" disabled={kunciModal} value={modalShown} onChange={(e) => setModal(e.target.value)} />
                {factor > 0 && Number(f.cost) > 0 && <div className="muted">{rp(Number(f.cost))} per {f.base_unit}</div>}
              </div>
              <div className="field"><label>Harga jual</label>
                <input required inputMode="numeric" disabled={terkunci(u)} value={u.price} onChange={(e) => setUnit(i, 'price', e.target.value)} />
                {per != null && factor !== 1 && <div className="muted">= {rp(per)} per {f.base_unit}</div>}
                {per != null && Number(f.cost) > 0 && <div className="muted">laba {rp(per - Number(f.cost))} per {f.base_unit}</div>}
              </div>
              <div className="unit-del">
                {f.units.length > 1 && !terkunci(u) && <button type="button" className="secondary" onClick={() => setF({ ...f, units: f.units.filter((_, j) => j !== i) })}>Hapus</button>}
                {i === f.units.length - 1 && <button type="button" className="secondary" onClick={() => setF({ ...f, units: [...f.units, { ...blankUnit(), unit: '', factor: '' }] })}>+ Harga</button>}
              </div>
            </div>
          );
        })}
        {warns.map((w, i) => <div key={i} className="alert err" style={{ marginTop: 8 }}>{w}</div>)}
      </section>

      <section className="form-sec">
        {!edit && (
          <>
            <h2>Warna / varian &amp; stok awal</h2>
            <p className="muted">Stok dan level dalam satuan dasar ({f.base_unit}). Level: hijau = mulai menipis, kuning = waspada, merah = kritis (hijau &gt; kuning &gt; merah). Kosongkan nama warna bila produk tanpa warna.</p>
            {f.variants.map((v, i) => (
              <div className="row" key={i}>
                <div className="field"><label>Warna / varian</label><input value={v.color} placeholder="Hitam, 110, 077" onChange={(e) => setVar(i, 'color', e.target.value)} /></div>
                <div className="field"><label>Stok awal</label><input inputMode="decimal" value={v.stock} onChange={(e) => setVar(i, 'stock', e.target.value)} /></div>
                <div className="field"><label>Level hijau</label><input inputMode="decimal" value={v.level_green} onChange={(e) => setVar(i, 'level_green', e.target.value)} /></div>
                <div className="field"><label>Kuning</label><input inputMode="decimal" value={v.level_yellow} onChange={(e) => setVar(i, 'level_yellow', e.target.value)} /></div>
                <div className="field"><label>Merah</label><input inputMode="decimal" value={v.level_red} onChange={(e) => setVar(i, 'level_red', e.target.value)} /></div>
                {(f.variants.length > 1 || i === f.variants.length - 1) && (
                  <div className="row-act">
                    {f.variants.length > 1 && <button type="button" className="secondary" onClick={() => setF({ ...f, variants: f.variants.filter((_, j) => j !== i) })}>Hapus</button>}
                    {i === f.variants.length - 1 && <button type="button" className="secondary" onClick={() => setF({ ...f, variants: [...f.variants, blankVariant()] })}>+ Limit</button>}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
        {edit && <VariantTable productId={f.id} variants={variants} onChanged={onChanged} />}
        {edit && <p className="muted" style={{ marginTop: 12 }}>Stok dan level diatur di halaman Stok.</p>}
      </section>

      {err && <div className="alert err">{err}</div>}
      <div className="row" style={{ marginTop: 12 }}>
        <button disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        <button type="button" className="secondary" onClick={onCancel}>Batal</button>
      </div>
    </form>
  );
}
