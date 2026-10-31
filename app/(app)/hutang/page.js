'use client';
import { useEffect, useState } from 'react';
import { rp } from '@/lib/format';
import { teksPengingat } from '@/lib/pembeli';

export default function Hutang() {
  const [rows, setRows] = useState([]);
  const [cfg, setCfg] = useState({ template: '', toko: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = () => fetch('/api/debts').then((r) => r.json()).then((d) => { setRows(d.rows); setCfg(d); });
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

  async function dikenal(c) {
    const r = await fetch('/api/debts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, dikenal: !c.dikenal }),
    });
    setErr(r.ok ? '' : (await r.json()).error);
    load();
  }

  // Teks dari pengaturan admin (Panel), penanda {nama} {total} {rincian} {toko} {lewat_tempo}.
  function wa(c) {
    const text = teksPengingat(cfg.template, { nama: c.name, total: c.total_hutang, notas: c.notas, toko: cfg.toko });
    const phone = (c.phone || '').replace(/\D/g, '').replace(/^0/, '62');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  }

  const total = rows.reduce((s, c) => s + c.total_hutang, 0);
  const lewat = rows.filter((c) => c.lewat_nota > 0);
  return (
    <>
      <h1>Hutang pelanggan</h1>
      <div className="card">
        <p>Total beredar: <strong>{rp(total)}</strong> ({rows.length} pembeli)
          {lewat.length > 0 && <> • <span className="badge red">{lewat.reduce((s, c) => s + c.lewat_nota, 0)} nota lewat jatuh tempo, {rp(lewat.reduce((s, c) => s + c.lewat_tempo, 0))}</span></>}</p>
        {msg && <div className="alert ok">{msg}</div>}
        {err && <div className="alert err">{err}</div>}
        {rows.length === 0 ? (
          <p className="muted">Tidak ada hutang.</p>
        ) : (
          <table>
            <thead><tr><th>Nama &amp; nota (jatuh tempo)</th><th>Kontak</th><th>Sejak</th><th className="r">Hutang</th><th></th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.name} {c.dikenal ? <span className="muted">(dikenal)</span> : null}
                    {c.notas.map((n) => (
                      <div key={n.id} className={n.lewat ? '' : 'muted'} style={n.lewat ? { color: 'var(--red)' } : undefined}>
                        {n.nomor} • {n.tanggal} • sisa {rp(n.sisa)} • jatuh tempo {n.jatuh_tempo || '-'}{n.lewat ? ' • LEWAT TEMPO' : ''}
                      </div>
                    ))}
                  </td>
                  <td>{c.phone || <span className="muted">-</span>}<br /><span className="muted">{c.address || ''}</span></td>
                  <td>{c.last_hutang_date || '-'}</td>
                  <td className="r">{rp(c.total_hutang)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button onClick={() => bayar(c)}>Bayar</button>{' '}
                    <button className="secondary" disabled={!c.phone} title={c.phone ? '' : 'Isi nomor WhatsApp dulu (Kontak)'} onClick={() => wa(c)}>Reminder WA</button>{' '}
                    <button className="secondary" onClick={() => kontak(c)}>Kontak</button>{' '}
                    <button className="secondary" onClick={() => dikenal(c)}>{c.dikenal ? 'Batal dikenal' : 'Tandai dikenal'}</button>
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
