'use client';
import { useEffect, useState } from 'react';
import Modal from '../Modal';
import { rp, num } from '@/lib/format';

const blank = { id: null, name: '', phone: '', address: '', note: '' };

export default function Supplier() {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [showOff, setShowOff] = useState(false);

  const [retur, setRetur] = useState([]); // retur barang rusak yang belum selesai
  const [formRetur, setFormRetur] = useState(null); // { supplier_id, qty: { variant_id: teks }, catatan }
  const [rusak, setRusak] = useState([]); // warna yang punya stok rusak
  const [msg, setMsg] = useState('');

  const load = () => {
    fetch('/api/suppliers?all=1').then((r) => r.json()).then(setRows);
    fetch('/api/retur-supplier').then((r) => r.json()).then(setRetur);
  };
  useEffect(() => { load(); }, []);

  async function bukaRetur() {
    setErr('');
    const st = await fetch('/api/stock').then((r) => r.json());
    setRusak(st.filter((v) => v.stok_rusak > 0));
    setFormRetur({ supplier_id: '', qty: {}, catatan: '' });
  }

  async function kirimRetur(e) {
    e.preventDefault();
    setErr('');
    const items = Object.entries(formRetur.qty).filter(([, x]) => Number(x) > 0).map(([id, x]) => ({ variant_id: Number(id), qty: Number(x) }));
    const r = await fetch('/api/retur-supplier', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier_id: Number(formRetur.supplier_id), items, catatan: formRetur.catatan }),
    });
    const d = await r.json();
    if (!r.ok) return setErr(d.error);
    setFormRetur(null);
    setMsg(`Retur #${d.id} dikirim (nilai ${rp(d.nilai)}). Stok rusak sudah berkurang.`);
    load();
  }

  async function selesai(r, status) {
    const body = { id: r.id, status };
    if (status === 'diuangkan') {
      const uang = prompt(`Uang yang diterima dari ${r.supplier_name} (masuk dompet kulakan):`, String(r.nilai));
      if (uang == null) return;
      body.uang = Number(uang);
    } else if (!confirm(status === 'diganti'
      ? 'Supplier mengirim barang pengganti? Barang akan muncul di "Menunggu masuk rak" (Pembelian) dengan harga Rp 0.'
      : 'Supplier menolak? Barang kembali ke stok rusak.')) return;
    const res = await fetch('/api/retur-supplier', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json();
    setMsg(res.ok ? `Retur #${r.id}: ${status}.` : d.error);
    load();
  }

  async function save(e) {
    e.preventDefault();
    setErr('');
    const r = await fetch('/api/suppliers', {
      method: f.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
    });
    const d = await r.json();
    if (!r.ok) return setErr(d.error);
    setF(null);
    load();
  }

  async function toggle(s) {
    if (s.active && !confirm(`Nonaktifkan supplier "${s.name}"?`)) return;
    await fetch('/api/suppliers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, active: !s.active }) });
    load();
  }

  const shown = rows.filter((s) => (showOff || s.active) && `${s.name} ${s.phone || ''} ${s.address || ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <h1>Supplier</h1>
      <div className="card row">
        <div><label>Cari</label><input value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div><label><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} style={{ width: 'auto' }} /> Tampilkan nonaktif</label></div>
        <div><button onClick={() => { setF({ ...blank }); setErr(''); }}>+ Supplier baru</button></div>
        <div><button className="secondary" onClick={bukaRetur}>Kembalikan barang rusak</button></div>
      </div>
      {msg && <div className="alert">{msg}</div>}

      {retur.length > 0 && (
        <div className="card">
          <h2>Retur barang rusak yang belum selesai</h2>
          {retur.map((r) => (
            <div key={r.id} style={{ marginBottom: 10 }}>
              <strong>#{r.id}</strong> • {r.supplier_name} • {r.dibuat_pada.slice(0, 10)} • nilai {rp(r.nilai)} <span className="muted">• {r.oleh}{r.catatan && ` • ${r.catatan}`}</span>
              {r.items.map((i) => <div key={i.id} className="muted" style={{ paddingLeft: 14 }}>{i.product_name} {i.color}: {num(i.qty)} {i.base_unit}</div>)}
              <div style={{ marginTop: 4 }}>
                <button className="secondary" onClick={() => selesai(r, 'diganti')}>Diganti barang</button>{' '}
                <button className="secondary" onClick={() => selesai(r, 'diuangkan')}>Diuangkan</button>{' '}
                <button className="secondary" onClick={() => selesai(r, 'ditolak')}>Ditolak</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formRetur && (
        <Modal title="Kembalikan barang rusak ke supplier" onClose={() => setFormRetur(null)}>
          <form onSubmit={kirimRetur}>
            <div className="field"><label>Supplier</label>
              <select required value={formRetur.supplier_id} onChange={(e) => setFormRetur({ ...formRetur, supplier_id: e.target.value })}>
                <option value="">— pilih —</option>
                {rows.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {!rusak.length ? <p className="muted">Tidak ada stok rusak.</p> : (
              <table>
                <thead><tr><th>Barang</th><th className="r">Stok rusak</th><th>Dikembalikan</th></tr></thead>
                <tbody>
                  {rusak.map((v) => (
                    <tr key={v.id}>
                      <td>{v.product_name} {v.color}</td>
                      <td className="r">{num(v.stok_rusak)} {v.base_unit}</td>
                      <td><input inputMode="decimal" style={{ width: 80 }} value={formRetur.qty[v.id] || ''} onChange={(e) => setFormRetur({ ...formRetur, qty: { ...formRetur.qty, [v.id]: e.target.value } })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="field"><label>Catatan</label><input value={formRetur.catatan} onChange={(e) => setFormRetur({ ...formRetur, catatan: e.target.value })} /></div>
            {err && <div className="alert err">{err}</div>}
            <button disabled={!rusak.length}>Kirim, kurangi stok rusak</button>
          </form>
        </Modal>
      )}

      {f && (
        <Modal title={f.id ? 'Ubah supplier' : 'Supplier baru'} onClose={() => setF(null)}>
          <form onSubmit={save}>
            <div className="row">
              <div className="field"><label>Nama supplier / toko</label><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
              <div className="field"><label>Telepon / WhatsApp</label><input inputMode="tel" value={f.phone || ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            </div>
            <div className="field"><label>Alamat</label><input value={f.address || ''} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
            <div className="field"><label>Catatan (barang yang dipasok, jatuh tempo bayar, dll.)</label><input value={f.note || ''} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
            {err && <div className="alert err">{err}</div>}
            <button>Simpan</button>
          </form>
        </Modal>
      )}

      <div className="card">
        <table>
          <thead><tr><th>Supplier</th><th>Kontak</th><th>Catatan</th><th></th></tr></thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} style={s.active ? undefined : { opacity: 0.5 }}>
                <td>{s.name}{!s.active && ' · NONAKTIF'}</td>
                <td>{s.phone || '-'}<div className="muted">{s.address}</div></td>
                <td className="muted">{s.note}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="secondary" onClick={() => { setF({ ...s }); setErr(''); }}>Ubah</button>{' '}
                  <button className="secondary" onClick={() => toggle(s)}>{s.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan="4" className="muted">Belum ada supplier.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
