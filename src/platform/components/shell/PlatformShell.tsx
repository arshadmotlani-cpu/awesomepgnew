'use client';

import { Suspense, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { PlatformSidebar } from './PlatformSidebar';
import { PlatformTopBar } from './PlatformTopBar';

type Props = {
  adminEmail: string;
  children: React.ReactNode;
};

/**
 * Sidebar active-state needs searchParams; keep that Suspense local so page
 * children are not trapped in the same boundary (soft-nav can otherwise leave
 * the previous admin page visible when opening /onboarding).
 */
function PlatformShellChrome({
  adminEmail,
  children,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filter = searchParams.get('filter');
  const activePath = filter ? `${pathname}?filter=${filter}` : pathname;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="plt-root flex min-h-[100dvh]">
      <PlatformSidebar
        activePath={activePath}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <PlatformTopBar
          adminEmail={adminEmail}
          onMenuClick={() => setSidebarOpen(true)}
        />
        {/* Remount main when the route changes so RSC children cannot stick. */}
        <main key={pathname} className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PlatformShell({ adminEmail, children }: Props) {
  return (
    <Suspense
      fallback={
        <div className="plt-root flex min-h-[100dvh] items-center justify-center text-sm text-[var(--plt-text-muted)]">
          Loading platform admin…
        </div>
      }
    >
      <PlatformShellChrome adminEmail={adminEmail}>{children}</PlatformShellChrome>
    </Suspense>
  );
}
