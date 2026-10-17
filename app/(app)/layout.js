import { requirePage } from '@/lib/auth';
import AppShell from './AppShell';
import { getSettings, idleConfig } from '@/lib/settings';

export default async function AppLayout({ children }) {
  const s = await requirePage();
  const idle = idleConfig(await getSettings());
  return <AppShell name={s.name} role={s.role} idle={{ enabled: idle.enabled, minutes: idle.minutes }}>{children}</AppShell>;
}
