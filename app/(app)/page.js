import Link from 'next/link';
import { db } from '@/lib/db';
import { rp, num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default function Beranda() {
  const today = db
    .prepare(
      `SELECT COUNT(*) AS nota, COALESCE(SUM(total),0) AS omset, COALESCE(SUM(hutang),0) AS hutang
       FROM sales WHERE date(created_at) = date('now','localtime')`
    )
    .get();
  const totalHutang = db.prepare('SELECT COALESCE(SUM(total_hutang),0) AS v FROM customers').get().v;
  const low = db
    .prepare(
      `SELECT v.*, p.name AS product_name, p.base_unit FROM variants v JOIN products p ON p.id = v.product_id
       WHERE (v.level_green > 0 OR v.level_yellow > 0 OR v.level_red > 0) AND v.stock <= v.level_green
       ORDER BY (v.stock <= v.level_red) DESC, (v.stock <= v.level_yellow) DESC, p.name LIMIT 15`
    )
    .all();

  return (
    <>
      <h1>Beranda</h1>
      <div className="grid stats">
        <div className="card stat"><div className="v">{rp(today.omset)}</div><div className="l">Omset hari ini</div></div>
        <div className="card stat"><div className="v">{today.nota}</div><div className="l">Nota hari ini</div></div>
        <div className="card stat"><div className="v">{rp(today.hutang)}</div><div className="l">Hutang baru hari ini</div></div>
        <div className="card stat"><div className="v">{rp(totalHutang)}</div><div className="l">Total hutang beredar</div></div>
      </div>
      <div className="card">
        <h2>Perlu restok ({low.length})</h2>
        {low.length === 0 ? (
          <p className="muted">Semua stok aman.</p>
        ) : (
          <table>
            <thead><tr><th>Produk</th><th>Warna</th><th className="r">Sisa</th><th>Status</th></tr></thead>
            <tbody>
              {low.map((v) => {
                const st = v.stock <= v.level_red ? 'red' : v.stock <= v.level_yellow ? 'yellow' : 'green';
                return (
                  <tr key={v.id}>
                    <td>{v.product_name}</td>
                    <td>{v.color || '-'}</td>
                    <td className="r">{num(v.stock)} {v.base_unit}</td>
                    <td><span className={`badge ${st}`}>{st === 'red' ? 'Kritis' : st === 'yellow' ? 'Waspada' : 'Mulai menipis'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p><Link href="/stok">Lihat semua stok →</Link></p>
      </div>
    </>
  );
}
