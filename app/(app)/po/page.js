'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { rp, num } from '@/lib/format';
import Modal from '../Modal';

const STATUS = { draft: 'Draf', dikirim: 'Dikirim ke supplier', diterima_sebagian: 'Diterima sebagian', diterima: 'Diterima', batal: 'Batal' };

// Pesanan ke supplier sebelum barang datang. PO tidak mengubah stok: barang yang datang dicatat di
// Pembelian / barang masuk dengan memilih PO-nya, lalu dimasukkan ke rak seperti biasa.
export default function PO() {
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [f, setF] = useState(null); // { supplier_id, catatan, items: [{ key, p, unit_name, factor, qty, harga }] }
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => fetch('/api/po').then((r) => r.json()).then(setRows);
  useEffect(() => {
    load();
    fetch('/api/suppliers').then((r) => r.json()).then(setSuppliers);
    fetch('/api/products').then((r) => r.json()).then(setProducts);
  }, []);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return products.filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(t)).slice(0, 10);
  }, [q, products]);

  function tambah(p) {
    const u = [...p.units].sort((a, b) => b.factor - a.factor)[0] || { name: p.base_unit, factor: 1 };
    setF({ ...f, items: [...f.items, { key: `${p.id}-${Date.now()}`, p, unit_name: u.name, factor: String(u.factor), qty: '1', harga: '' }] });
    setQ('');
  }
  const upd = (key, patch) => setF({ ...f, items: f.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) });

  async function simpan(e) {
    e.preventDefault();
    setErr('');
    const r = await fetch('/api/po', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: Number(f.supplier_id), catatan: f.catatan,
        items: f.items.map((i) => ({ product_id: i.p.id, unit_name: i.unit_name, factor: Number(i.factor), qty: Number(i.qty), harga_perkiraan: i.harga })),
      }),
    });
    const d = await r.json();
    if (!r.ok) return setErr(d.error);
    setF(null);
    setMsg(`PO #${d.id} disimpan sebagai draf. Tekan "Kirim" setelah dipesan ke supplier.`);
    load();
  }

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
      <p className="muted">PO mencatat pesanan sebelum barang datang dan tidak mengubah stok. Saat barang datang, catat di <Link href="/pembelian">Pembelian</Link> dengan memilih PO-nya. Pembelian tetap lunas.</p>
      <div className="card row">
        <div><button onClick={() => { setF({ supplier_id: '', catatan: '', items: [] }); setErr(''); }}>+ PO baru</button></div>
      </div>
      {msg && <div className="alert">{msg}</div>}

      {f && (
        <Modal title="PO baru" onClose={() => setF(null)}>
          <form onSubmit={simpan}>
            <div className="field"><label>Supplier</label>
              <select required value={f.supplier_id} onChange={(e) => setF({ ...f, supplier_id: e.target.value })}>
                <option value="">— pilih —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ position: 'relative' }}>
              <label>Tambah barang (ketik min. 2 huruf)</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} />
              {matches.length > 0 && (
                <div className="suggest">{matches.map((p) => <div key={p.id} onClick={() => tambah(p)}><span className="muted">{p.category}</span> {p.name}</div>)}</div>
              )}
            </div>
            {f.items.length > 0 && (
              <table>
                <thead><tr><th>Barang</th><th>Satuan</th><th>Isi</th><th>Jumlah</th><th>Perkiraan harga / satuan</th><th></th></tr></thead>
                <tbody>
                  {f.items.map((i) => (
                    <tr key={i.key}>
                      <td>{i.p.name}</td>
                      <td><input style={{ width: 80 }} value={i.unit_name} onChange={(e) => upd(i.key, { unit_name: e.target.value })} /></td>
                      <td><input style={{ width: 60 }} inputMode="decimal" value={i.factor} onChange={(e) => upd(i.key, { factor: e.target.value })} /></td>
                      <td><input style={{ width: 60 }} inputMode="decimal" value={i.qty} onChange={(e) => upd(i.key, { qty: e.target.value })} /></td>
                      <td><input style={{ width: 100 }} inputMode="numeric" value={i.harga} placeholder="boleh kosong" onChange={(e) => upd(i.key, { harga: e.target.value })} /></td>
                      <td><button type="button" className="secondary" onClick={() => setF({ ...f, items: f.items.filter((x) => x.key !== i.key) })}>Hapus</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="field"><label>Catatan</label><input value={f.catatan} onChange={(e) => setF({ ...f, catatan: e.target.value })} /></div>
            {err && <div className="alert err">{err}</div>}
            <button disabled={!f.items.length}>Simpan draf PO</button>
          </form>
        </Modal>
      )}

      <div className="card">
        {rows.map((po) => (
          <div key={po.id} style={{ marginBottom: 14 }}>
            <strong>PO #{po.id}</strong> • {po.supplier_name} • {po.dibuat_pada.slice(0, 10)} • <span className={`badge ${po.status === 'diterima' ? 'ok' : po.status === 'batal' ? 'red' : 'yellow'}`}>{STATUS[po.status]}</span>
            <span className="muted"> • {po.oleh}{po.catatan && ` • ${po.catatan}`}</span>
            {po.items.map((i) => (
              <div key={i.id} className="muted" style={{ paddingLeft: 14 }}>
                {i.product_name}: {num(i.qty)} {i.unit_name}{i.harga_perkiraan != null && ` × ${rp(i.harga_perkiraan)}`}
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
