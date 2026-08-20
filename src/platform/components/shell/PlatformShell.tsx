'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { PlatformSidebar } from './PlatformSidebar';
import { PlatformTopBar } from './PlatformTopBar';

type Props = {
  adminEmail: string;
  children: React.ReactNode;
};

export function PlatformShell({ adminEmail, children }: Props) {
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
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
