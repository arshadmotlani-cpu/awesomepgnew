'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { logoutAction } from '@/src/hair/actions/auth';
import { FyhSidebarBrand } from '@/src/components/brand/fyh/FyhSidebarBrand';
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
      <header className="sticky top-0 z-[100] border-b border-[color:var(--fyh-border-strong)] bg-fyh-elevated/90 backdrop-blur-xl">
        <div className="flex h-11 min-h-11 items-center gap-2 px-3 sm:gap-2.5 sm:px-3.5 md:px-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 md:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>

          <HairQuickActionsMenu />

          <Link
            href="/dashboard/revenue"
            className="hidden min-w-0 max-w-[10rem] shrink sm:block lg:max-w-[12rem]"
          >
            <FyhSidebarBrand className="!h-auto !border-0 !px-0 !py-0" />
          </Link>
          <Link
            href="/dashboard/revenue"
            className="fyh-display truncate text-sm font-semibold text-fyh-text sm:hidden"
          >
            For Your Hair
          </Link>

          <div className="flex min-w-0 flex-1 justify-center px-2 sm:px-4">
            <HairGlobalSearch />
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <Link href="/profile" className="hidden text-right lg:block">
              <p className="text-xs font-medium text-fyh-text">{admin.displayName ?? 'Admin'}</p>
              <p className="max-w-[9rem] truncate text-xs text-fyh-text-secondary">
                {admin.email}
              </p>
            </Link>
            <form action={logoutAction} className="hidden sm:block">
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-[250] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(100vw-3rem,14rem)] flex-col bg-fyh-elevated shadow-2xl">
            <div className="flex items-center justify-between border-b border-[color:var(--fyh-border-strong)] p-2">
              <FyhSidebarBrand className="!h-12 !flex-1 !border-0" />
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
              <HairSidebar entries={navEntries} className="!flex h-full w-full border-0" />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
