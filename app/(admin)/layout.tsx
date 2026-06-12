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
    <div className="apg-admin-shell flex min-h-[100dvh] bg-[#0B0F14] text-[#f4f6f8]">
      <aside className="sticky top-0 hidden h-[100dvh] lg:block">
        <Sidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />
        <main className="flex-1 overflow-x-hidden px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-7xl space-y-5 sm:space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
