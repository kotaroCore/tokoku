'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductForm, blank, CATS } from '../ProdukForm';

// Halaman input produk baru beserta warna dan stok awal.
export default function ProdukBaru() {
  const router = useRouter();
  const [cats, setCats] = useState(CATS);

  useEffect(() => {
    fetch('/api/products?all=1').then((r) => r.json()).then((ps) => setCats([...new Set([...CATS, ...ps.map((p) => p.category)])]));
  }, []);

  const kembali = () => router.push('/produk');
  return <ProductForm init={blank()} cats={cats} variants={[]} onChanged={() => {}} onDone={kembali} onCancel={kembali} />;
}
