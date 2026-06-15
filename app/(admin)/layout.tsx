import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Sidebar } from '@/src/components/admin/Sidebar';
import { TopNav } from '@/src/components/admin/TopNav';
import { AdminActionDrawerProvider } from '@/src/components/admin/AdminActionDrawerProvider';
import { DevAssistantShell } from '@/src/components/admin/DevAssistantShell';
import { canAccessDevAssistant } from '@/src/lib/auth/devAssistantAccess';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { loadAdminNavBadges } from '@/src/services/adminNavBadges';

export const metadata: Metadata = {
  title: 'Admin · Awesome PG',
  description: 'Property management console for Awesome PG.',
};

export default async function AdminGroupLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminSession('/admin');
  const badges = await loadAdminNavBadges(session);
  const devAssistantEnabled = canAccessDevAssistant(session.role);
  return (
    <DevAssistantShell
      enabled={devAssistantEnabled}
      admin={{
        id: session.adminId,
        email: session.email,
        fullName: session.fullName,
        role: session.role,
      }}
    >
      <div className="apg-admin-shell flex h-[100dvh] w-full max-w-[100vw] overflow-hidden bg-[#0B0F14] text-[#f4f6f8]">
        <aside className="hidden h-full shrink-0 lg:block lg:w-64">
          <Sidebar badges={badges} />
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <TopNav badges={badges} />
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-6 lg:px-8 lg:py-8">
            <div className="apg-admin-scroll flex min-h-0 w-full min-w-0 flex-1 flex-col gap-5 overflow-y-auto overflow-x-auto sm:gap-6">
              <AdminActionDrawerProvider>{children}</AdminActionDrawerProvider>
            </div>
          </main>
        </div>
      </div>
    </DevAssistantShell>
  );
}
