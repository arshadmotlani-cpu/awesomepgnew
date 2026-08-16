'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu, X } from 'lucide-react';
import { CapitalOsLogoLockup } from '@/src/components/brand/capital-os/CapitalOsLogoLockup';
import { capitalNavItems } from '@/src/capital/lib/capitalNav';
import { cn } from '@/src/capital/lib/utils';

export function CapitalMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedOnPath, setOpenedOnPath] = useState(pathname);
  const menuOpen = open && openedOnPath === pathname;

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  function openMenu() {
    setOpenedOnPath(pathname);
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
  }

  const drawer =
    menuOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[200] md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Capital navigation"
          >
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={closeMenu}
              aria-hidden
            />
            <div
              className="absolute inset-y-0 left-0 flex w-full max-w-[min(100vw,20rem)] flex-col border-r border-white/8 bg-ac-elevated/95 shadow-2xl backdrop-blur-xl"
              style={{ paddingLeft: 'var(--ac-safe-left)' }}
            >
              <div
                className="flex shrink-0 flex-col border-b border-white/8"
                style={{ paddingTop: 'var(--ac-safe-top)' }}
              >
                <div className="flex items-center justify-between gap-2 px-3 py-3 min-h-14">
                <CapitalOsLogoLockup markSize={32} />
                <button
                  type="button"
                  onClick={closeMenu}
                  aria-label="Close navigation menu"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/10 text-ac-text hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
                </div>
              </div>
              <nav
                className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3"
                style={{ paddingBottom: 'max(0.75rem, var(--ac-safe-bottom))' }}
              >
                {capitalNavItems.map(({ href, label, icon: Icon }) => {
                  const active =
                    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={closeMenu}
                      className={cn(
                        'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                        active
                          ? 'bg-ac-accent/10 text-ac-accent'
                          : 'text-ac-text-secondary hover:bg-white/5 hover:text-ac-text',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={openMenu}
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-ac-surface/80 text-ac-text hover:bg-white/10 md:hidden"
        aria-label="Open navigation menu"
        aria-expanded={menuOpen}
      >
        <Menu className="h-5 w-5" />
      </button>
      {drawer}
    </>
  );
}
