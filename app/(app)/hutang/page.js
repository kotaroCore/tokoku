'use client';
import { useEffect, useState } from 'react';
import { rp } from '@/lib/format';

export default function Hutang() {
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = () => fetch('/api/debts').then((r) => r.json()).then(setRows);
  useEffect(() => { load(); }, []);

  async function bayar(c) {
    const input = prompt(`Bayar hutang ${c.name} (sisa ${rp(c.total_hutang)}). Jumlah:`);
    if (!input) return;
    const r = await fetch('/api/debts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: c.id, amount: Number(input) }),
    });
    const d = await r.json();
    setErr(r.ok ? '' : d.error);
    setMsg(r.ok ? 'Pembayaran dicatat.' : '');
    load();
  }

  async function kontak(c) {
    const phone = prompt('Nomor WhatsApp (format 628xxxx):', c.phone || '');
    if (phone == null) return;
    const address = prompt('Alamat / keterangan pembeli:', c.address || '');
    if (address == null) return;
    await fetch('/api/debts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, phone, address }),
    });
    load();
  }

  function wa(c) {
    const tgl = c.last_hutang_date ? new Date(c.last_hutang_date).toLocaleDateString('id-ID') : '-';
    const text =
      `Assalamualaikum, ini pengingat pembayaran hutang dari Toko.\n` +
      `- Nama: ${c.name}\n- Nominal: ${rp(c.total_hutang)}\n- Sejak tanggal: ${tgl}\nTerima kasih 🙏`;
    const phone = (c.phone || '').replace(/\D/g, '').replace(/^0/, '62');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  }

  const total = rows.reduce((s, c) => s + c.total_hutang, 0);
  return (
    <>
      <h1>Hutang pelanggan</h1>
      <div className="card">
        <p>Total beredar: <strong>{rp(total)}</strong> ({rows.length} pembeli)</p>
        {msg && <div className="alert ok">{msg}</div>}
        {err && <div className="alert err">{err}</div>}
        {rows.length === 0 ? (
          <p className="muted">Tidak ada hutang.</p>
        ) : (
          <table>
            <thead><tr><th>Nama</th><th>Kontak</th><th>Sejak</th><th className="r">Hutang</th><th></th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.phone || <span className="muted">-</span>}<br /><span className="muted">{c.address || ''}</span></td>
                  <td>{c.last_hutang_date || '-'}</td>
                  <td className="r">{rp(c.total_hutang)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button onClick={() => bayar(c)}>Bayar</button>{' '}
                    <button className="secondary" disabled={!c.phone} onClick={() => wa(c)}>Reminder WA</button>{' '}
                    <button className="secondary" onClick={() => kontak(c)}>Kontak</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
