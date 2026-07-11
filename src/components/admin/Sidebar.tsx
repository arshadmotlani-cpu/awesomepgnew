'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AwesomePgLogo } from '@/src/components/brand/AwesomePgLogo';
import { DraggableSidebarNav } from '@/src/components/admin/sidebar/DraggableSidebarNav';
import { SidebarDragStatusBanner } from '@/src/components/admin/sidebar/SidebarDragStatusBanner';

export function Sidebar({
  onNavigate,
  variant = 'docked',
}: {
  onNavigate?: () => void;
  variant?: 'docked' | 'drawer';
}) {
  const pathname = usePathname() ?? '/admin';
  const [optimisticHref, setOptimisticHref] = useState<string | null>(null);

  useEffect(() => {
    if (!optimisticHref) return;
    if (pathname === optimisticHref || pathname.startsWith(`${optimisticHref}/`)) {
      setOptimisticHref(null);
    }
  }, [optimisticHref, pathname]);

  const activePath = optimisticHref ?? pathname;

  const handleNavigateStart = useCallback(
    (href: string) => {
      setOptimisticHref(href);
      onNavigate?.();
    },
    [onNavigate],
  );

  return (
    <nav
      className={
        variant === 'drawer'
          ? 'flex w-full flex-col bg-[#1A1F27]'
          : 'relative z-10 flex h-full min-h-0 w-64 shrink-0 flex-col border-r border-white/5 bg-[#1A1F27]'
      }
    >
      {variant === 'drawer' ? (
        <div className="flex items-center gap-2 px-5 pb-2 pt-4">
          <AwesomePgLogo size={36} className="shrink-0 shadow-md shadow-orange-500/20" />
          <div>
            <p className="text-sm font-semibold tracking-tight text-white">Menu</p>
            <p className="text-[11px] text-apg-silver">Drag ⋮⋮ to reorder</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-5 py-5">
          <AwesomePgLogo size={36} className="shrink-0 shadow-md shadow-orange-500/25" />
          <div>
            <p className="text-sm font-semibold tracking-tight text-white">Awesome PG</p>
            <p className="text-[11px] text-apg-silver">Drag ⋮⋮ to reorder</p>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
        <SidebarDragStatusBanner />
        <DraggableSidebarNav activePath={activePath} onNavigateStart={handleNavigateStart} />
      </div>

      <div className="border-t border-white/5 px-5 py-3 text-[11px] leading-relaxed text-apg-silver/60">
        Module → PG → Resident → Actions
      </div>
    </nav>
  );
}
