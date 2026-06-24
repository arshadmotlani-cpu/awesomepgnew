'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { IconLogo } from './icons';
import { AdminNavLink } from '@/src/components/admin/AdminNavLink';
import { useSidebarLayoutItems } from '@/src/components/admin/sidebar/SidebarLayoutProvider';
import { SIDEBAR_MODULE_REGISTRY } from '@/src/lib/admin/sidebarModules';
import { isModuleActive } from '@/src/lib/admin/navigation';
import { useAdminNavBadges } from '@/src/components/admin/AdminLiveRefreshProvider';

export function Sidebar({
  onNavigate,
  variant = 'docked',
}: {
  onNavigate?: () => void;
  variant?: 'docked' | 'drawer';
}) {
  const pathname = usePathname() ?? '/admin';
  const badges = useAdminNavBadges();
  const layoutItems = useSidebarLayoutItems();
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

  const pinnedItems = layoutItems.filter((item) => item.pinned);
  const regularItems = layoutItems.filter((item) => !item.pinned);

  function renderItem(item: (typeof layoutItems)[number]) {
    const def = SIDEBAR_MODULE_REGISTRY[item.key];
    const Icon = def.icon;
    const active = item.module
      ? isModuleActive(activePath, item.module)
      : activePath === item.href || activePath.startsWith(`${item.href}/`);
    const badgeCount = item.badgeKey
      ? badges[item.badgeKey]
      : item.module
        ? badges[item.module]
        : undefined;

    return (
      <li key={item.key}>
        <AdminNavLink
          href={item.href}
          label={item.pinned ? `⭐ ${item.label}` : item.label}
          icon={Icon}
          active={active}
          badgeCount={badgeCount}
          onNavigateStart={handleNavigateStart}
        />
      </li>
    );
  }

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
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#FF5A1F] text-white">
            <IconLogo width={18} height={18} />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight text-white">Menu</p>
            <p className="text-[11px] text-apg-silver">Tap a section to navigate</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#FF5A1F] text-white apg-glow-btn">
            <IconLogo width={18} height={18} />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight text-white">Awesome PG</p>
            <p className="text-[11px] text-apg-silver">Admin console</p>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
        {pinnedItems.length > 0 ? (
          <div className="mt-2">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
              Pinned
            </p>
            <ul className="space-y-0.5">{pinnedItems.map(renderItem)}</ul>
          </div>
        ) : null}

        <div className={pinnedItems.length > 0 ? 'mt-4' : 'mt-2'}>
          {pinnedItems.length > 0 && regularItems.length > 0 ? (
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-apg-silver/70">
              Navigation
            </p>
          ) : null}
          <ul className="space-y-0.5">{regularItems.map(renderItem)}</ul>
        </div>
      </div>

      <div className="border-t border-white/5 px-5 py-3 text-[11px] leading-relaxed text-apg-silver/60">
        <a href="/admin/settings/sidebar-layout" className="hover:text-apg-orange">
          Customize sidebar →
        </a>
      </div>
    </nav>
  );
}
