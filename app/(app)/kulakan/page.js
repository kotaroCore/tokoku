'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { num, rp } from '@/lib/format';

const LABEL = { yellow: 'Waspada', red: 'Kritis' };

export default function Kulakan() {
  const [rows, setRows] = useState(null);
  useEffect(() => { fetch('/api/kulakan').then((r) => r.json()).then(setRows); }, []);

  return (
    <>
      <h1>Kulakan</h1>
      <div className="card">
        <p style={{ marginTop: 0 }}>Barang yang stoknya kritis atau waspada, dengan harga beli terakhir dari tiap supplier. Untuk memesan ke supplier per warna, buat <Link href="/po">PO</Link>.</p>
        {rows === null ? <p>Memuat...</p> : !rows.length ? <div className="alert ok">Semua stok aman, belum ada yang perlu dikulak.</div> : (
          <table>
            <thead><tr><th>Produk</th><th>Stok menipis</th><th>Harga terakhir (supplier · nota)</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.product_id}>
                  <td><b>{p.product_name}</b><br /><small>{p.category}</small></td>
                  <td>
                    {p.variants.map((v) => (
                      <div key={v.id}>
                        {v.color || '-'}: {num(v.stock)} {p.base_unit}{' '}
                        <span className={`badge ${v.status}`}>{LABEL[v.status]}</span>
                      </div>
                    ))}
                  </td>
                  <td>
                    {p.suppliers.length ? p.suppliers.map((s) => (
                      <div key={s.supplier_name}>
                        <b>{s.supplier_name}</b>: {rp(s.unit_cost)} / {s.unit_name}
                        <br /><small>Nota #{s.purchase_id} · {s.date.slice(0, 10)}</small>
                      </div>
                    )) : <small>Belum pernah dibeli dari supplier</small>}
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
