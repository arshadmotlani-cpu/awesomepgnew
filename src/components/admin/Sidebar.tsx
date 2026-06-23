'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { IconLogo } from './icons';
import { NAV_SECTIONS } from './navItems';
import { AdminNavLink } from '@/src/components/admin/AdminNavLink';
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
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mt-4">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-apg-silver/70">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map(({ href, label, icon, module, badgeKey }) => {
                const active = module
                  ? isModuleActive(activePath, module)
                  : activePath === href || activePath.startsWith(`${href}/`);
                const badgeCount = badgeKey
                  ? badges[badgeKey]
                  : module
                    ? badges[module]
                    : undefined;
                return (
                  <li key={href}>
                    <AdminNavLink
                      href={href}
                      label={label}
                      icon={icon}
                      active={active}
                      badgeCount={badgeCount}
                      onNavigateStart={handleNavigateStart}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/5 px-5 py-3 text-[11px] leading-relaxed text-apg-silver/60">
        Module → PG → Resident → Actions
      </div>
    </nav>
  );
}
