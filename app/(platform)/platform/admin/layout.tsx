import { requirePlatformAdminPage } from '@/src/platform/lib/auth/guards';

export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformAdminPage();
  return children;
}
