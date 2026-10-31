'use client';
import { useState } from 'react';

// Grafik SVG sederhana tanpa library: satu seri, warna --brand, sumbu dan garis bantu tipis,
// tooltip saat kursor / jari di atas batang atau titik. Judul grafik ditulis di luar komponen.

const W = 640;
const H = 220;
const PAD = { l: 64, r: 12, t: 12, b: 28 };

function skala(max) {
  if (!(max > 0)) return { atas: 1, garis: [0, 1] };
  const kasar = max / 4;
  const p = 10 ** Math.floor(Math.log10(kasar));
  const langkah = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= kasar);
  const atas = Math.ceil(max / langkah) * langkah;
  const garis = [];
  for (let y = 0; y <= atas + 1e-9; y += langkah) garis.push(y);
  return { atas, garis };
}

const singkat = (n) => (n >= 1e6 ? `${Math.round(n / 1e5) / 10} jt` : n >= 1e3 ? `${Math.round(n / 100) / 10} rb` : String(Math.round(n)));

function Kerangka({ garis, y, labels, children, tip }) {
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: 'block', maxWidth: W }}>
        {garis.map((g) => (
          <g key={g}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(g) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{singkat(g)}</text>
          </g>
        ))}
        {labels}
        {children}
      </svg>
      {tip && (
        <div className="card" style={{ position: 'absolute', left: `${(tip.x / W) * 100}%`, top: 0, transform: 'translateX(-50%)', padding: '4px 8px', margin: 0, fontSize: 13, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}

// data: [{ label, nilai, teks }] — teks = isi tooltip.
export function GrafikBatang({ data, labelSumbu = (l) => l }) {
  const [tip, setTip] = useState(null);
  if (!data.length) return <p className="muted">Tidak ada data.</p>;
  const { atas, garis } = skala(Math.max(...data.map((d) => d.nilai)));
  const lebar = (W - PAD.l - PAD.r) / data.length;
  const y = (v) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / atas);
  const bar = Math.max(2, Math.min(36, lebar - 2));
  const tiap = Math.ceil(data.length / 8); // label sumbu x jarang-jarang supaya tidak bertumpuk
  return (
    <Kerangka garis={garis} y={y} tip={tip}
      labels={data.map((d, i) => (i % tiap === 0 ? (
        <text key={d.label} x={PAD.l + lebar * (i + 0.5)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{labelSumbu(d.label)}</text>
      ) : null))}>
      {data.map((d, i) => {
        const x = PAD.l + lebar * i + (lebar - bar) / 2;
        const top = y(d.nilai);
        const h = Math.max(0, y(0) - top);
        const r = Math.min(4, bar / 2, h);
        return (
          <g key={d.label} onMouseEnter={() => setTip({ x: x + bar / 2, text: d.teks })} onMouseLeave={() => setTip(null)} onClick={() => setTip({ x: x + bar / 2, text: d.teks })}>
            <rect x={PAD.l + lebar * i} y={PAD.t} width={lebar} height={H - PAD.t - PAD.b} fill="transparent" />
            {h > 0 && <path d={`M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + bar - r} Q${x + bar},${top} ${x + bar},${top + r} V${y(0)} Z`} fill="var(--brand)" />}
          </g>
        );
      })}
      <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeWidth="1" />
    </Kerangka>
  );
}

// data: [{ label, nilai, teks }] berurutan waktu.
export function GrafikGaris({ data }) {
  const [tip, setTip] = useState(null);
  if (!data.length) return <p className="muted">Tidak ada data.</p>;
  const { atas, garis } = skala(Math.max(...data.map((d) => d.nilai)));
  const n = data.length;
  const x = (i) => PAD.l + (n === 1 ? (W - PAD.l - PAD.r) / 2 : ((W - PAD.l - PAD.r) * i) / (n - 1));
  const y = (v) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / atas);
  const tiap = Math.ceil(n / 6);
  return (
    <Kerangka garis={garis} y={y} tip={tip}
      labels={data.map((d, i) => (i % tiap === 0 || i === n - 1 ? (
        <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{d.label}</text>
      ) : null))}>
      <polyline points={data.map((d, i) => `${x(i)},${y(d.nilai)}`).join(' ')} fill="none" stroke="var(--brand)" strokeWidth="2" />
      {data.map((d, i) => (
        <g key={i} onMouseEnter={() => setTip({ x: x(i), text: d.teks })} onMouseLeave={() => setTip(null)} onClick={() => setTip({ x: x(i), text: d.teks })}>
          <circle cx={x(i)} cy={y(d.nilai)} r="12" fill="transparent" />
          <circle cx={x(i)} cy={y(d.nilai)} r="4" fill="var(--brand)" stroke="var(--card)" strokeWidth="2" />
        </g>
      ))}
    </Kerangka>
  );
}
