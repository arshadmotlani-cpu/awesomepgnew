'use client';

import Link from 'next/link';
import { useState } from 'react';
import { LogOut, Menu, UserRound, X } from 'lucide-react';
import { logoutAction } from '@/src/hair/actions/auth';
import { FyhMark } from '@/src/components/brand/fyh/FyhMark';
import { ThemeToggle } from '@/src/hair/components/ThemeToggle';
import { HairGlobalSearch } from '@/src/hair/components/HairGlobalSearch';
import { HairQuickActionsMenu } from '@/src/hair/components/HairQuickActionsMenu';
import { HairSidebar } from '@/src/hair/components/HairSidebar';
import { Button } from '@/src/hair/components/ui/button';
import type { HairAdmin } from '@/src/hair/lib/auth/session';
import type { HairNavEntry } from '@/src/hair/lib/nav';

type HairAppHeaderProps = {
  admin: HairAdmin;
  navEntries?: HairNavEntry[];
};

export function HairAppHeader({ admin, navEntries }: HairAppHeaderProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-[100] w-full min-w-0 overflow-x-hidden border-b border-[color:var(--fyh-border-strong)] bg-fyh-elevated/90 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl">
        <div className="flex h-11 min-h-11 min-w-0 items-center gap-1.5 px-2 pl-[max(0.5rem,env(safe-area-inset-left,0px))] pr-[max(0.5rem,env(safe-area-inset-right,0px))] sm:gap-2 sm:px-3 lg:px-4">
          {/* Logo in header when sidebar drawer is active (< lg). Sidebar brand covers lg+. */}
          <FyhMark
            size={32}
            className="shrink-0 lg:hidden"
            title="SOFT"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 lg:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>

          <HairQuickActionsMenu staffName={admin.displayName ?? 'Staff'} />

          <div className="min-w-0 flex-1 px-1 sm:px-2 md:px-3">
            <HairGlobalSearch />
          </div>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <ThemeToggle className="shrink-0" />
            <Link
              href="/profile"
              className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-fyh-text transition hover:bg-[color:var(--fyh-surface-muted)] lg:hidden"
              aria-label="Profile"
            >
              <UserRound className="h-4 w-4" />
            </Link>
            <Link href="/profile" className="hidden min-w-0 max-w-[8.5rem] shrink-0 text-right lg:block xl:max-w-[9rem]">
              <p className="truncate text-xs font-medium text-fyh-text">{admin.displayName ?? 'Admin'}</p>
              <p className="truncate text-xs text-fyh-text-secondary">{admin.email}</p>
            </Link>
            <form action={logoutAction} className="shrink-0">
              <Button type="submit" variant="ghost" size="sm" className="px-2 sm:px-3" aria-label="Sign out">
                <LogOut className="h-4 w-4 sm:hidden" aria-hidden />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </form>
          </div>
        </div>
      </header>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-[250] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(100vw-3rem,14rem)] flex-col bg-fyh-elevated shadow-2xl">
            <div className="flex items-center justify-between border-b border-[color:var(--fyh-border-strong)] p-2">
              <FyhMark size={32} className="shrink-0" title="SOFT" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Close navigation"
                onClick={() => setMobileNavOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto" onClick={() => setMobileNavOpen(false)}>
              <HairSidebar entries={navEntries} showBrand={false} className="!flex h-full w-full border-0" />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
