'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { DraggableSidebarNav } from '@/src/components/admin/sidebar/DraggableSidebarNav';
import { SidebarDragStatusBanner } from '@/src/components/admin/sidebar/SidebarDragStatusBanner';
import { ApgOsSidebarBrand } from '@/src/components/brand/apg-os/ApgOsSidebarBrand';

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
      return;
    }
    // Soft navigation can hang or abort on heavy admin pages; never leave the
    // sidebar stuck on a destination that never became the real pathname.
    const timer = window.setTimeout(() => setOptimisticHref(null), 8_000);
    return () => window.clearTimeout(timer);
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
        <ApgOsSidebarBrand className="pb-0 pt-2" />
      ) : (
        <div>
          <ApgOsSidebarBrand />
          <p className="px-5 pb-1 text-[11px] text-apg-silver">Drag ⋮⋮ to reorder</p>
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
