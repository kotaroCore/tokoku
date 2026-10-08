import { requirePage } from '@/lib/auth';
import AppShell from './AppShell';

export default async function AppLayout({ children }) {
  const s = await requirePage();
  return <AppShell name={s.name}>{children}</AppShell>;
}
