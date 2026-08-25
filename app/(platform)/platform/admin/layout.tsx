import '@/src/platform/styles/platform-tokens.css';
import { requirePlatformAdminPage } from '@/src/platform/lib/auth/guards';
import { getPlatformSession } from '@/src/platform/lib/auth/session';
import { PlatformShell } from '@/src/platform/components/shell/PlatformShell';

export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformAdminPage();
  const session = await getPlatformSession();
  const adminEmail = session?.email ?? 'Administrator';

  return <PlatformShell adminEmail={adminEmail}>{children}</PlatformShell>;
}
