'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProductForm, CATS, toForm } from '../ProdukForm';

// Halaman ubah produk beserta daftar warna (ubah nama, nonaktifkan, tambah warna).
export default function ProdukUbah() {
  const { id } = useParams();
  const router = useRouter();
  const [products, setProducts] = useState(null);

  const load = () => fetch('/api/products?all=1').then((r) => r.json()).then(setProducts);
  useEffect(() => { load(); }, []);

  if (!products) return <p className="muted">Memuat…</p>;
  const p = products.find((x) => x.id === Number(id));
  if (!p) return <div className="alert err">Produk tidak ditemukan.</div>;

  const cats = [...new Set([...CATS, ...products.map((x) => x.category)])];
  const kembali = () => router.push('/produk');
  return (
    <ProductForm key={p.id} init={toForm(p)} cats={cats} variants={p.variants} onChanged={load} onDone={kembali} onCancel={kembali} />
  );
}
