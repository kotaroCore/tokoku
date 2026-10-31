'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMe } from '../../me';

// Daftar tempat penyimpanan (ruangan / lemari / rak). Hanya admin yang menambah, mengganti nama, atau menonaktifkan,
// supaya nama tempat seragam; staf tinggal memilih di Stok, Masuk rak, dan Opname.
// Ganti nama berlaku untuk semua warna yang memakai tempat itu. Lokasi tidak dihapus, hanya dinonaktifkan.
export default function Lokasi() {
  const admin = useMe().role === 'admin';
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ ruangan: '', lemari: '', rak: '' });
  const [ubah, setUbah] = useState(null); // { id, ruangan, lemari, rak }
  const [err, setErr] = useState('');

  const load = () => fetch('/api/lokasi?all=1').then((r) => r.json()).then(setRows);
  useEffect(() => { load(); }, []);

  async function kirim(method, body) {
    setErr('');
    const r = await fetch('/api/lokasi', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { setErr(d.error); return false; }
    load();
    return true;
  }

  async function tambah(e) {
    e.preventDefault();
    if (await kirim('POST', f)) setF({ ...f, rak: '' });
  }

  return (
    <>
      <h1>Lokasi rak</h1>
      <p className="muted">Daftar tempat penyimpanan. Setiap warna memilih maksimal 3 tempat dari daftar ini. {admin ? 'Hanya admin yang bisa menambah dan mengubah.' : 'Hanya admin yang bisa menambah dan mengubah daftar ini.'} <Link href="/stok">← Stok</Link> · <Link href="/stok/opname">Opname per warna</Link></p>
      {admin && (
        <form className="card row" onSubmit={tambah}>
          <div className="field"><label>Ruangan</label><input required value={f.ruangan} onChange={(e) => setF({ ...f, ruangan: e.target.value })} placeholder="mis. Toko, Gudang" /></div>
          <div className="field"><label>Lemari</label><input value={f.lemari} onChange={(e) => setF({ ...f, lemari: e.target.value })} placeholder="mis. Lemari A" /></div>
          <div className="field"><label>Rak</label><input value={f.rak} onChange={(e) => setF({ ...f, rak: e.target.value })} placeholder="mis. Rak 2" /></div>
          <div><button>+ Tambah lokasi</button></div>
        </form>
      )}
      {err && <div className="alert err">{err}</div>}
      <div className="card">
        <table>
          <thead><tr><th>Lokasi</th><th className="r">Warna disimpan</th>{admin && <th></th>}</tr></thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} style={l.aktif ? undefined : { opacity: 0.5 }}>
                <td>
                  {ubah?.id === l.id ? (
                    <div className="row">
                      <input value={ubah.ruangan} onChange={(e) => setUbah({ ...ubah, ruangan: e.target.value })} placeholder="Ruangan" />
                      <input value={ubah.lemari} onChange={(e) => setUbah({ ...ubah, lemari: e.target.value })} placeholder="Lemari" />
                      <input value={ubah.rak} onChange={(e) => setUbah({ ...ubah, rak: e.target.value })} placeholder="Rak" />
                    </div>
                  ) : <>{l.label}{!l.aktif && ' · NONAKTIF'}</>}
                </td>
                <td className="r">{l.warna}</td>
                {admin && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {ubah?.id === l.id ? (
                      <>
                        <button onClick={async () => { if (await kirim('PATCH', ubah)) setUbah(null); }}>Simpan</button>{' '}
                        <button className="secondary" onClick={() => setUbah(null)}>Batal</button>
                      </>
                    ) : (
                      <>
                        <button className="secondary" onClick={() => setUbah({ id: l.id, ruangan: l.ruangan, lemari: l.lemari, rak: l.rak })}>Ganti nama</button>{' '}
                        <button className="secondary" onClick={() => kirim('PATCH', { id: l.id, aktif: !l.aktif })}>{l.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="3" className="muted">Belum ada lokasi.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
