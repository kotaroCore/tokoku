'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductForm, blank, CATS } from '../ProdukForm';

// Halaman input produk baru beserta warna dan stok awal.
export default function ProdukBaru() {
  const router = useRouter();
  const [cats, setCats] = useState(CATS);
  const [presets, setPresets] = useState(null);

  useEffect(() => {
    fetch('/api/products?all=1').then((r) => r.json()).then((ps) => setCats([...new Set([...CATS, ...ps.map((p) => p.category)])]));
    fetch('/api/unit-presets').then((r) => r.json()).then(setPresets);
  }, []);

  const kembali = () => router.push('/produk');
  if (!presets) return <p className="muted">Memuat…</p>;
  return <ProductForm init={blank(presets)} cats={cats} presets={presets} variants={[]} onChanged={() => {}} onDone={kembali} onCancel={kembali} />;
}
