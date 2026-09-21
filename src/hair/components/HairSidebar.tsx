'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Heart,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  SlidersHorizontal,
  ShoppingBag,
  Sparkles,
  UserRound,
  Users,
  Wallet,
  Truck,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { FyhSidebarBrand } from '@/src/components/brand/fyh/FyhSidebarBrand';
import {
  visibleHairNavEntries,
  type HairNavEntry,
  type HairNavGroup,
  type HairNavIconKey,
  type HairNavLink,
} from '@/src/hair/lib/nav';
import { cn } from '@/src/hair/lib/utils';

const NAV_ICONS: Record<HairNavIconKey, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  users: Users,
  'calendar-days': CalendarDays,
  receipt: Receipt,
  sparkles: Sparkles,
  'shopping-bag': ShoppingBag,
  'clipboard-list': ClipboardList,
  warehouse: Warehouse,
  heart: Heart,
  package: Package,
  'sliders-horizontal': SlidersHorizontal,
  settings: Settings,
  wallet: Wallet,
  truck: Truck,
};

function NavLink({
  item,
  onNavigate,
}: {
  item: HairNavLink;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
  const Icon = NAV_ICONS[item.iconKey];
  return (
    <Link
      href={item.href}
      onClick={() => onNavigate?.()}
      className={cn('fyh-nav-link', active && 'fyh-nav-link-active')}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="fyh-nav-label">{item.label}</span>
    </Link>
  );
}

function NavGroup({
  group,
  onNavigate,
}: {
  group: HairNavGroup;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const childActive = group.children.some(
    (c) => pathname === c.href || pathname.startsWith(`${c.href}/`),
  );
  const [open, setOpen] = useState(group.defaultExpanded ?? childActive);
  const Icon = NAV_ICONS[group.iconKey];

  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  return (
    <div className="fyh-nav-group min-w-0 space-y-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          'fyh-nav-link w-full min-w-0',
          childActive && 'text-fyh-text',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="fyh-nav-label">{group.label}</span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="fyh-nav-group-children space-y-0.5">
          {group.children.map((c) => {
            const active =
              c.href === '/billing'
                ? pathname === '/billing' || pathname === '/billing/'
                : pathname === c.href || pathname.startsWith(`${c.href}/`);
            return (
              <Link
                key={c.href}
                href={c.href}
                onClick={() => onNavigate?.()}
                className={cn('fyh-nav-sublink', active && 'fyh-nav-sublink-active')}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function HairSidebar({
  entries,
  className,
  showBrand = true,
  variant = 'desktop',
  onNavigate,
}: {
  entries?: HairNavEntry[];
  className?: string;
  showBrand?: boolean;
  variant?: 'desktop' | 'drawer';
  onNavigate?: () => void;
}) {
  const navEntries = entries ?? visibleHairNavEntries();
  const isDrawer = variant === 'drawer';

  return (
    <aside
      className={cn(
        'fyh-sidebar-nav shrink-0 border-r border-[color:var(--fyh-border-strong)] bg-fyh-elevated/95 backdrop-blur-xl',
        isDrawer
          ? 'flex h-full w-full flex-col border-0 bg-transparent backdrop-blur-none'
          : 'hidden lg:flex lg:h-dvh lg:max-h-dvh lg:w-[var(--fyh-sidebar-width)] lg:min-h-0 lg:flex-col lg:overflow-hidden',
        className,
      )}
    >
      {showBrand && !isDrawer ? <FyhSidebarBrand /> : null}
      <nav className="flex-1 space-y-0.5 overflow-y-auto overscroll-contain p-2">
        {navEntries.map((entry) =>
          entry.type === 'link' ? (
            <NavLink key={entry.href} item={entry} onNavigate={onNavigate} />
          ) : (
            <NavGroup key={entry.id} group={entry} onNavigate={onNavigate} />
          ),
        )}
      </nav>
      <div className="border-t border-[color:var(--fyh-border)] p-2">
        <Link href="/profile" className="fyh-nav-link" onClick={() => onNavigate?.()}>
          <UserRound className="h-4 w-4 shrink-0" aria-hidden />
          <span className="fyh-nav-label">Profile</span>
        </Link>
      </div>
    </aside>
  );
}
