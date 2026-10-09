import { requireOwnerPage } from '@/lib/auth';

// Panel kontrol khusus owner: staf yang membuka alamat ini dikembalikan ke beranda.
export default async function PanelLayout({ children }) {
  await requireOwnerPage();
  return children;
}
