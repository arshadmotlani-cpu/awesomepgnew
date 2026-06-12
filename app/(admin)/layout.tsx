import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Sidebar } from '@/src/components/admin/Sidebar';
import { TopNav } from '@/src/components/admin/TopNav';
import { requireAdminSession } from '@/src/lib/auth/guards';

export const metadata: Metadata = {
  title: 'Admin · Awesome PG',
  description: 'Property management console for Awesome PG.',
};

export default async function AdminGroupLayout({ children }: { children: ReactNode }) {
  await requireAdminSession('/admin');
  return (
    <div className="apg-admin-shell flex h-[100dvh] w-full max-w-[100vw] overflow-hidden bg-[#0B0F14] text-[#f4f6f8]">
      <aside className="hidden h-full shrink-0 lg:block lg:w-64">
        <Sidebar />
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopNav />
        <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full min-w-0 max-w-7xl space-y-5 sm:space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
