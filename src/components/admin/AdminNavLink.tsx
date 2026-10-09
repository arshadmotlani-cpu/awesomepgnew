'use client';

import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
  type ComponentType,
  type SVGProps,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  adminNavClickIsNoOp,
  adminNavModuleFor,
  adminNavPathOnly,
  adminNavShouldClientNavigate,
} from '@/src/lib/admin/adminNavLinkLogic';
import { CLIENT_NAV_FALLBACK_MS } from '@/src/lib/reliability/clientNavigationFallback';
import {
  logAdminNavClick,
  logAdminNavComplete,
  logAdminNavRouteStart,
  type AdminNavTiming,
} from '@/src/lib/admin/navInstrumentation';

type AdminNavLinkProps = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  active: boolean;
  badgeCount?: number;
  onNavigateStart?: (href: string) => void;
  /** When false, show full label (e.g. Payment Reviews) without ellipsis. */
  truncateLabel?: boolean;
};

export function AdminNavLink({
  href,
  label,
  icon: Icon,
  active,
  badgeCount,
  onNavigateStart,
  truncateLabel = true,
}: AdminNavLinkProps) {
  const pathname = usePathname() ?? '/admin';
  const router = useRouter();
  const timingRef = useRef<AdminNavTiming | null>(null);
  const pendingHrefRef = useRef<string | null>(null);

  useEffect(() => {
    const pending = pendingHrefRef.current;
    if (!pending) return;
    const pendingPath = adminNavPathOnly(pending);
    const moduleMatch =
      pathname === pendingPath ||
      pathname.startsWith(`${pendingPath}/`) ||
      adminNavModuleFor(pathname) === adminNavModuleFor(pending);
    if (moduleMatch) {
      if (timingRef.current) {
        logAdminNavComplete(timingRef.current, pathname);
      }
      pendingHrefRef.current = null;
      timingRef.current = null;
    }
  }, [pathname]);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      if (adminNavClickIsNoOp(pathname, href)) {
        onNavigateStart?.(href);
        return;
      }

      const timing = logAdminNavClick(href, pathname);
      timingRef.current = timing;
      pendingHrefRef.current = href;
      logAdminNavRouteStart(timing, href);
      onNavigateStart?.(href);

      if (adminNavShouldClientNavigate(pathname, href)) {
        event.preventDefault();
        const targetPath = adminNavPathOnly(href);
        router.push(href);
        window.setTimeout(() => {
          const current = window.location.pathname;
          if (current === targetPath || current.startsWith(`${targetPath}/`)) return;
          window.location.assign(href);
        }, CLIENT_NAV_FALLBACK_MS);
      }
    },
    [href, onNavigateStart, pathname, router],
  );

  return (
    <Link
      href={href}
      prefetch={false}
      scroll={false}
      onClick={handleClick}
      aria-current={active ? 'page' : undefined}
      className={
        'group flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ' +
        (active
          ? 'bg-[#FF5A1F]/15 font-medium text-[#FF5A1F]'
          : 'text-apg-silver hover:bg-white/5 hover:text-white')
      }
    >
      <Icon
        width={18}
        height={18}
        className={
          'shrink-0 ' + (active ? 'text-[#FF5A1F]' : 'text-apg-silver/70 group-hover:text-white')
        }
      />
      <span
        className={
          truncateLabel
            ? 'min-w-0 flex-1 truncate'
            : 'min-w-0 flex-1 whitespace-normal leading-snug'
        }
      >
        {label}
      </span>
      {badgeCount != null && badgeCount > 0 ? (
        <span
          className="inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-[#FF5A1F] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
          aria-label={`${badgeCount} pending`}
        >
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      ) : null}
    </Link>
  );
}
