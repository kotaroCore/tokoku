'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { rp, num } from '@/lib/format';
import Modal from '../Modal';

const STATUS = { draft: 'Draf', dikirim: 'Dikirim ke supplier', diterima_sebagian: 'Diterima sebagian', diterima: 'Diterima', batal: 'Batal' };
const LEVEL = { yellow: 'Waspada', red: 'Kritis' };

// Pesanan ke supplier sebelum barang datang. PO tidak mengubah stok: barang yang datang dicatat di
// Pembelian / barang masuk dengan memilih PO-nya, lalu dimasukkan ke rak seperti biasa.
export default function PO() {
  const [rows, setRows] = useState([]);
  const [baru, setBaru] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => fetch('/api/po').then((r) => r.json()).then(setRows);
  useEffect(() => { load(); }, []);

  async function status(po, s) {
    if (s === 'batal' && !confirm(`Batalkan PO #${po.id}?`)) return;
    const r = await fetch('/api/po', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: po.id, status: s }) });
    const d = await r.json();
    setMsg(r.ok ? `PO #${po.id}: ${STATUS[s]}.` : d.error);
    load();
  }

  return (
    <>
      <h1>PO ke supplier</h1>
      <p className="muted">PO dipesan per warna dari daftar stok yang menipis, dengan harga terakhir tiap supplier sebagai pembanding. PO tidak mengubah stok: saat barang datang, catat di <Link href="/pembelian">Pembelian</Link> dengan memilih PO-nya. Pembelian tetap lunas.</p>
      <div className="card row">
        <div><button onClick={() => setBaru(true)}>+ PO baru</button></div>
        <div><Link href="/kulakan">Lihat Kulakan</Link></div>
      </div>
      {msg && <div className="alert">{msg}</div>}

      {baru && <PoBaru onClose={() => setBaru(false)} onSaved={(id) => { setBaru(false); setMsg(`PO #${id} disimpan sebagai draf. Tekan "Kirim" setelah dipesan ke supplier.`); load(); }} />}

      <div className="card">
        {rows.map((po) => (
          <div key={po.id} style={{ marginBottom: 14 }}>
            <strong>PO #{po.id}</strong> • {po.supplier_name} • {po.dibuat_pada.slice(0, 10)} • <span className={`badge ${po.status === 'diterima' ? 'ok' : po.status === 'batal' ? 'red' : 'yellow'}`}>{STATUS[po.status]}</span>
            <span className="muted"> • {po.oleh}{po.catatan && ` • ${po.catatan}`}</span>
            {po.items.map((i) => (
              <div key={i.id} className="muted" style={{ paddingLeft: 14 }}>
                {i.product_name}{i.color != null && ` — ${i.color || '-'}`}: {num(i.qty)} {i.unit_name}{i.harga_perkiraan != null && ` × ${rp(i.harga_perkiraan)}`}
                {po.status !== 'draft' && ` • diterima ${num(i.diterima / i.factor)} dari ${num(i.qty)} ${i.unit_name}`}
              </div>
            ))}
            <div style={{ marginTop: 4 }}>
              {po.status === 'draft' && <><button className="secondary" onClick={() => status(po, 'dikirim')}>Kirim (sudah dipesan)</button>{' '}</>}
              {['draft', 'dikirim', 'diterima_sebagian'].includes(po.status) && <button className="secondary" onClick={() => status(po, 'batal')}>Batalkan</button>}
            </div>
          </div>
        ))}
        {!rows.length && <p className="muted">Belum ada PO.</p>}
      </div>
    </>
  );
}

// Form PO baru: daftar warna yang kritis / waspada (seperti Kulakan) dengan harga terakhir tiap supplier.
// Centang warna yang dipesan dan isi jumlahnya; harga terakhir supplier terpilih jadi perkiraan harga.
function PoBaru({ onClose, onSaved }) {
  const [list, setList] = useState(null); // dari /api/kulakan
  const [units, setUnits] = useState({}); // product_id -> satuan jual produk
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [pilih, setPilih] = useState({}); // variant_id -> teks jumlah
  const [satuan, setSatuan] = useState({}); // product_id -> nama satuan
  const [harga, setHarga] = useState({}); // product_id -> teks harga per satuan
  const [catatan, setCatatan] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/kulakan').then((r) => r.json()).then(setList);
    fetch('/api/suppliers').then((r) => r.json()).then(setSuppliers);
    fetch('/api/products').then((r) => r.json()).then((ps) => setUnits(Object.fromEntries(ps.map((p) => [p.id, p.units]))));
  }, []);

  // Pilihan satuan: satuan di nota supplier sebelumnya, lalu satuan jual produk.
  const opsi = (p) => {
    const out = [];
    for (const s of p.suppliers) if (!out.some((o) => o.name === s.unit_name)) out.push({ name: s.unit_name, factor: s.factor });
    for (const u of [...(units[p.product_id] || [])].sort((a, b) => b.factor - a.factor)) if (!out.some((o) => o.name === u.name)) out.push({ name: u.name, factor: u.factor });
    if (!out.length) out.push({ name: p.base_unit, factor: 1 });
    return out;
  };
  const terakhir = (p, sid = supplierId) => p.suppliers.find((s) => String(s.supplier_id) === String(sid));
  const unitOf = (p) => {
    const o = opsi(p);
    const nama = satuan[p.product_id] ?? terakhir(p)?.unit_name ?? o[0].name;
    return o.find((x) => x.name === nama) || o[0];
  };
  const hargaOf = (p) => {
    if (harga[p.product_id] != null) return harga[p.product_id];
    const t = terakhir(p);
    return t && t.unit_name === unitOf(p).name ? String(t.unit_cost) : '';
  };
  // Saran jumlah: sampai level hijau, dibulatkan ke atas dalam satuan pesan.
  const saran = (p, v) => {
    const f = unitOf(p).factor;
    return String(Math.max(1, Math.ceil(Math.max(0, (v.level_green || v.level_yellow) - v.stock) / f)));
  };

  function gantiSupplier(id) {
    setSupplierId(id);
    // Satuan dan harga ikut nota terakhir supplier yang baru dipilih.
    setSatuan({});
    setHarga({});
  }

  const baris = (list || []).flatMap((p) => p.variants.filter((v) => pilih[v.id] != null).map((v) => ({ p, v, qty: Number(String(pilih[v.id]).replace(',', '.')) })));
  const total = baris.reduce((t, b) => t + (Number(hargaOf(b.p)) || 0) * (b.qty || 0), 0);

  async function simpan() {
    setErr('');
    if (!supplierId) return setErr('Pilih supplier.');
    if (!baris.length) return setErr('Centang minimal satu warna.');
    if (baris.some((b) => !(b.qty > 0))) return setErr('Isi jumlah semua warna yang dicentang.');
    const r = await fetch('/api/po', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: Number(supplierId), catatan,
        items: baris.map(({ p, v, qty }) => {
          const u = unitOf(p);
          return { product_id: p.product_id, variant_id: v.id, unit_name: u.name, factor: u.factor, qty, harga_perkiraan: hargaOf(p) };
        }),
      }),
    });
    const d = await r.json();
    if (!r.ok) return setErr(d.error);
    onSaved(d.id);
  }

  return (
    <Modal title="PO baru" onClose={onClose}>
      <div className="field"><label>Supplier</label>
        <select value={supplierId} onChange={(e) => gantiSupplier(e.target.value)}>
          <option value="">— pilih —</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      {list === null ? <p className="muted">Memuat…</p> : !list.length ? <div className="alert ok">Semua stok aman, belum ada warna yang menipis.</div> : list.map((p) => {
        const u = unitOf(p);
        // Bandingkan harga antar supplier per satuan dasar, karena satuan di nota bisa berbeda (dosin, gross).
        const perDasar = p.suppliers.map((s) => s.unit_cost / (s.factor || 1));
        const termurah = perDasar.length > 1 ? Math.min(...perDasar) : null;
        return (
          <div key={p.product_id} className="card" style={{ marginBottom: 10 }}>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div><b>{p.product_name}</b><br /><small className="muted">{p.category}</small></div>
              <div><label>Satuan pesan</label>
                <select value={u.name} onChange={(e) => { setSatuan({ ...satuan, [p.product_id]: e.target.value }); setHarga({ ...harga, [p.product_id]: undefined }); }}>
                  {opsi(p).map((o) => <option key={o.name} value={o.name}>{o.name}{o.factor !== 1 ? ` (${num(o.factor)} ${p.base_unit})` : ''}</option>)}
                </select>
              </div>
              <div><label>Perkiraan harga / {u.name}</label>
                <input inputMode="numeric" style={{ width: 120 }} value={hargaOf(p)} placeholder="boleh kosong" onChange={(e) => setHarga({ ...harga, [p.product_id]: e.target.value })} />
              </div>
            </div>
            <div className="muted" style={{ margin: '6px 0' }}>
              {p.suppliers.length ? p.suppliers.map((s, i) => (
                <div key={s.supplier_id} style={String(s.supplier_id) === String(supplierId) ? { color: 'var(--text)', fontWeight: 600 } : undefined}>
                  {s.supplier_name}: {rp(s.unit_cost)} / {s.unit_name}{s.factor !== 1 && ` (${rp(perDasar[i])} / ${p.base_unit})`} · nota #{s.purchase_id} {s.date.slice(0, 10)}
                  {termurah != null && perDasar[i] === termurah && <span className="badge ok"> termurah</span>}
                </div>
              )) : 'Belum pernah dibeli dari supplier'}
            </div>
            <table>
              <thead><tr><th></th><th>Warna</th><th className="r">Stok</th><th>Status</th><th>Jumlah ({u.name})</th></tr></thead>
              <tbody>
                {p.variants.map((v) => {
                  const on = pilih[v.id] != null;
                  return (
                    <tr key={v.id}>
                      <td><input type="checkbox" style={{ width: 'auto' }} checked={on} onChange={(e) => {
                        const x = { ...pilih };
                        if (e.target.checked) x[v.id] = saran(p, v); else delete x[v.id];
                        setPilih(x);
                      }} /></td>
                      <td>{v.color || '-'}</td>
                      <td className="r">{num(v.stock)} {p.base_unit}</td>
                      <td><span className={`badge ${v.status}`}>{LEVEL[v.status]}</span></td>
                      <td>{on && <input inputMode="decimal" style={{ width: 80 }} value={pilih[v.id]} onChange={(e) => setPilih({ ...pilih, [v.id]: e.target.value })} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      <div className="field"><label>Catatan</label><input value={catatan} onChange={(e) => setCatatan(e.target.value)} /></div>
      <p>{baris.length} warna dipilih{total > 0 && <> • perkiraan <strong>{rp(total)}</strong></>}</p>
      {err && <div className="alert err">{err}</div>}
      <button onClick={simpan} disabled={!baris.length}>Simpan draf PO</button>
    </Modal>
  );
}
