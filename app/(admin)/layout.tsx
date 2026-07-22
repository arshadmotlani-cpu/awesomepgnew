import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Sidebar } from '@/src/components/admin/Sidebar';
import { AdminTopNav } from '@/src/components/admin/AdminTopNav';
import { AdminLiveRefreshProvider } from '@/src/components/admin/AdminLiveRefreshProvider';
import { AdminActionDrawerProvider } from '@/src/components/admin/AdminActionDrawerProvider';
import { SidebarLayoutProvider } from '@/src/components/admin/sidebar/SidebarLayoutProvider';
import { profileAdminStep } from '@/src/lib/admin/adminProfile';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { loadAdminNavBadges } from '@/src/services/adminNavBadges';
import { getResolvedSidebarLayout } from '@/src/services/sidebarLayouts';
import { AdminPushRegistration } from '@/src/components/admin/AdminPushRegistration';
import { AdminMoneyInputGuard } from '@/src/components/admin/AdminMoneyInputGuard';
import { NotificationReadOnArrival } from '@/src/components/admin/NotificationReadOnArrival';

export const maxDuration = 60;

export const metadata: Metadata = {
  title: 'Admin · Awesome PG',
  description: 'Property management console for Awesome PG.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Awesome PG',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/apg-favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/apg-favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/apg-favicon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/apg-admin-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/apg-admin-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apg-apple-touch.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'Awesome PG Admin',
    images: [{ url: '/og/awesome-pg.png', width: 512, height: 512, alt: 'Awesome PG' }],
  },
};

export default async function AdminGroupLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminSession('/admin');
  const [badges, sidebarLayout] = await profileAdminStep('adminLayout', () =>
    Promise.all([loadAdminNavBadges(session), getResolvedSidebarLayout(session)]),
  );
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
        <AdminMoneyInputGuard />
        <NotificationReadOnArrival />
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
