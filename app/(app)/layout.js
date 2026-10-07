import Link from 'next/link';
import { requirePage } from '@/lib/auth';
import LogoutButton from './LogoutButton';

export default async function AppLayout({ children }) {
  const s = await requirePage();
  return (
    <>
      <nav className="top">
        <span className="brand">Tokoku</span>
        <Link href="/">Beranda</Link>
        <Link href="/pos">Kasir</Link>
        <Link href="/produk">Produk</Link>
        <Link href="/stok">Stok</Link>
        <Link href="/hutang">Hutang</Link>
        <Link href="/laporan">Laporan</Link>
        <span className="spacer" />
        <span className="muted">{s.name}</span>
        <LogoutButton />
      </nav>
      <main>{children}</main>
    </>
  );
}
