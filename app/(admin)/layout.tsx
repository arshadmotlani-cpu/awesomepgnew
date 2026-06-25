import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Sidebar } from '@/src/components/admin/Sidebar';
import { AdminTopNav } from '@/src/components/admin/AdminTopNav';
import { AdminLiveRefreshProvider } from '@/src/components/admin/AdminLiveRefreshProvider';
import { AdminActionDrawerProvider } from '@/src/components/admin/AdminActionDrawerProvider';
import { SidebarLayoutProvider } from '@/src/components/admin/sidebar/SidebarLayoutProvider';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { loadAdminNavBadges } from '@/src/services/adminNavBadges';
import { getResolvedSidebarLayout } from '@/src/services/sidebarLayouts';
import { AdminPushRegistration } from '@/src/components/admin/AdminPushRegistration';
import { syncActionItems } from '@/src/services/actionItems';

export const metadata: Metadata = {
  title: 'Admin · Awesome PG',
  description: 'Property management console for Awesome PG.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'APG Admin',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: '/roachie-premium.png',
  },
};

export default async function AdminGroupLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminSession('/admin');
  await syncActionItems(session).catch(() => undefined);
  const [badges, sidebarLayout] = await Promise.all([
    loadAdminNavBadges(session),
    getResolvedSidebarLayout(session),
  ]);
  const sidebarNavItems = sidebarLayout.items.map((item) => ({
    key: item.key,
    label: item.label,
    href: item.href,
    module: item.module,
    badgeKey: item.badgeKey,
    sortOrder: item.sortOrder,
    hidden: item.hidden,
    pinned: item.pinned,
  }));
  return (
    <AdminLiveRefreshProvider initialBadges={badges}>
      <SidebarLayoutProvider
        initialItems={sidebarNavItems}
        isSuperAdmin={session.role === 'super_admin'}
      >
      <div className="apg-admin-shell flex h-[100dvh] w-full max-w-[100vw] overflow-hidden bg-[#0B0F14] text-[#f4f6f8]">
        <AdminPushRegistration />
        <aside className="relative z-20 hidden h-full shrink-0 lg:block lg:w-64">
          <Sidebar />
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <AdminTopNav adminName={session.fullName} adminRole={session.role} />
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-6 lg:px-8 lg:py-8">
            <div className="apg-admin-scroll flex min-h-0 w-full min-w-0 flex-1 flex-col gap-5 overflow-y-auto overflow-x-auto sm:gap-6">
              <AdminActionDrawerProvider>{children}</AdminActionDrawerProvider>
            </div>
          </main>
        </div>
      </div>
      </SidebarLayoutProvider>
    </AdminLiveRefreshProvider>
  );
}
