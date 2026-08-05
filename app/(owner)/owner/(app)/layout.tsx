import { requireOwnerAuthPage } from '@/src/owner/lib/auth/guards';
import { OwnerSidebar } from '@/src/owner/components/OwnerSidebar';
import { OwnerTopBar } from '@/src/owner/components/OwnerTopBar';
import { headers } from 'next/headers';

export default async function OwnerAppLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireOwnerAuthPage();
  const hdrs = await headers();
  const activePath = hdrs.get('x-owner-pathname') ?? '/dashboard';

  return (
    <div className="flex min-h-screen">
      <OwnerSidebar activePath={activePath} />
      <div className="flex min-w-0 flex-1 flex-col">
        <OwnerTopBar admin={admin} />
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
