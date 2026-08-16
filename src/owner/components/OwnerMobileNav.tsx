'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu, X } from 'lucide-react';
import { OWNER_OS } from '@/src/lib/brand/ownerOsMetadata';
import { ownerNavItems } from '@/src/owner/lib/ownerNav';

export function OwnerMobileNav() {
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
            aria-label="Owner OS navigation"
          >
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={closeMenu}
              aria-hidden
            />
            <div
              className="absolute inset-y-0 left-0 flex w-full max-w-[min(100vw,20rem)] flex-col border-r border-white/10 bg-[#0f141b] shadow-2xl"
              style={{ paddingLeft: 'var(--oo-safe-left)' }}
            >
              <div
                className="flex shrink-0 flex-col border-b border-white/10"
                style={{ paddingTop: 'var(--oo-safe-top)' }}
              >
                <div className="flex items-center justify-between gap-2 px-3 py-3 min-h-14">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[#FF5A1F]">Owner OS</p>
                  <p className="text-sm font-semibold text-white">{OWNER_OS.name}</p>
                </div>
                <button
                  type="button"
                  onClick={closeMenu}
                  aria-label="Close navigation menu"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/10 text-white hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
                </div>
              </div>
              <nav
                className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3"
                style={{ paddingBottom: 'max(0.75rem, var(--oo-safe-bottom))' }}
              >
                {ownerNavItems.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeMenu}
                      className="oo-nav-link flex min-h-11 items-center"
                      data-active={active ? 'true' : 'false'}
                    >
                      {item.label}
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
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[color:var(--oo-surface)] text-white hover:bg-white/10 md:hidden"
        aria-label="Open navigation menu"
        aria-expanded={menuOpen}
      >
        <Menu className="h-5 w-5" />
      </button>
      {drawer}
    </>
  );
}
