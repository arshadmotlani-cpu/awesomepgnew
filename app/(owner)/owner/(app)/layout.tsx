import { requireOwnerAuthPage } from '@/src/owner/lib/auth/guards';
import { OwnerSidebar } from '@/src/owner/components/OwnerSidebar';
import { OwnerTopBar } from '@/src/owner/components/OwnerTopBar';
import { headers } from 'next/headers';

export default async function OwnerAppLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireOwnerAuthPage();
  const hdrs = await headers();
  const activePath = hdrs.get('x-owner-pathname') ?? '/dashboard';

  return (
    <div className="oo-shell flex">
      <OwnerSidebar activePath={activePath} />
      <div className="oo-app-column">
        <OwnerTopBar admin={admin} />
        <main
          className="oo-safe-px flex min-h-0 flex-col overflow-y-auto overflow-x-hidden p-4 pb-[max(1rem,var(--oo-safe-bottom))] md:p-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
