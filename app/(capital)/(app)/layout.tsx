import { Suspense } from 'react';
import { requireCapitalAuthPage } from '@/src/capital/lib/auth/guards';
import { CapitalSidebar } from '@/src/capital/components/CapitalSidebar';
import { CapitalTopBar } from '@/src/capital/components/CapitalTopBar';
import { CommandPalette } from '@/src/capital/components/CommandPalette';
import { CapitalProviders } from '@/src/capital/components/CapitalProviders';

export default async function CapitalAppLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireCapitalAuthPage();

  return (
    <CapitalProviders>
      <div className="flex min-h-screen">
        <CapitalSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <CapitalTopBar admin={admin} />
          <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
        </div>
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      </div>
    </CapitalProviders>
  );
}
