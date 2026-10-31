import { requireRolePage } from '@/lib/auth';

// Panel kontrol khusus admin: staf yang membuka alamat ini dikembalikan ke beranda.
export default async function PanelLayout({ children }) {
  await requireRolePage('admin');
  return children;
}
