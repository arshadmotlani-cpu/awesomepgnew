'use client';

import { AdminQuickMenu } from '@/src/components/admin/AdminQuickMenu';
import { AdminNotificationCenter } from '@/src/components/admin/AdminNotificationCenter';
import { OwnerOsNavLink } from '@/src/components/admin/OwnerOsNavLink';
import { useAdminNavBadges } from '@/src/components/admin/AdminLiveRefreshProvider';
import { LogoutButton } from '@/src/components/auth/LogoutButton';
import { ApgOsMark } from '@/src/components/brand/apg-os/ApgOsMark';
import { MobileNav } from './MobileNav';

export function AdminTopNav({
  adminName,
  adminRole,
  showOwnerOsLink = false,
}: {
  adminName?: string | null;
  adminRole?: string | null;
  showOwnerOsLink?: boolean;
}) {
  const badges = useAdminNavBadges();
  const unreadTotal = badges.notifications ?? 0;

  return (
    <header className="sticky top-0 z-40 flex min-h-14 w-full max-w-[100vw] items-center gap-2 border-b border-white/5 bg-[#0B0F14] px-3 pt-[env(safe-area-inset-top)] sm:gap-3 sm:px-4 lg:px-6">
      <ApgOsMark size={32} className="shrink-0" title="PG" />
      <MobileNav />
      <AdminQuickMenu />

      <div className="ml-auto flex shrink-0 items-center pr-0.5">
        <div className="flex items-center gap-0.5 sm:gap-2">
          {showOwnerOsLink ? <OwnerOsNavLink /> : null}
          <AdminNotificationCenter initialUnread={unreadTotal} />
          <div
            className="hidden items-center gap-2 rounded-md border border-white/10 bg-[#1A1F27] px-2 py-1 sm:flex"
            title={adminName ?? 'Admin'}
          >
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--apg-os-primary,#2563EB)] text-xs font-semibold text-white">
              {adminName?.charAt(0) ?? 'A'}
            </span>
            <div className="hidden min-w-0 max-w-[8rem] text-xs leading-tight md:block">
              <p className="truncate font-medium text-white">{adminName ?? 'Admin'}</p>
              <p className="truncate text-apg-silver capitalize">
                {(adminRole ?? 'viewer').replace('_', ' ')}
              </p>
            </div>
          </div>
          <LogoutButton
            scope="admin"
            label="Sign out"
            compactBelowSm
            className="min-h-10 shrink-0 rounded-md px-1.5 py-2 text-xs font-medium text-apg-silver hover:bg-white/10 hover:text-white disabled:opacity-50 sm:px-3 sm:text-sm"
          />
        </div>
      </div>
    </header>
  );
}
