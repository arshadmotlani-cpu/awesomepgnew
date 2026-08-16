import { Suspense } from 'react';
import Link from 'next/link';
import { requireCapitalAuthPage } from '@/src/capital/lib/auth/guards';
import { CapitalSidebar } from '@/src/capital/components/CapitalSidebar';
import { CapitalTopBar } from '@/src/capital/components/CapitalTopBar';
import { CommandPalette } from '@/src/capital/components/CommandPalette';
import { CapitalProviders } from '@/src/capital/components/CapitalProviders';
import { Button } from '@/src/capital/components/ui/button';

export default async function CapitalAppLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireCapitalAuthPage();

  return (
    <CapitalProviders>
      <div className="ac-capital-shell flex">
        <CapitalSidebar />
        <div className="ac-app-column">
          <CapitalTopBar admin={admin} />
          <main
            className="ac-safe-px flex min-h-0 flex-col overflow-y-auto overflow-x-hidden p-4 pb-[max(1rem,var(--ac-safe-bottom))] md:p-6"
          >
            <div className="mb-4 flex md:hidden">
              <Link href="/assets/new" className="w-full sm:w-auto">
                <Button className="min-h-11 w-full sm:w-auto">New Vehicle</Button>
              </Link>
            </div>
            {children}
          </main>
        </div>
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      </div>
    </CapitalProviders>
  );
}
