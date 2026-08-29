'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu, X } from 'lucide-react';
import { OwnerOsMark } from '@/src/components/brand/owner-os/OwnerOsMark';
import { ownerNavGroups } from '@/src/owner/lib/ownerNav';

function isNavActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

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
                <div className="flex min-h-14 items-center justify-between gap-2 px-3 py-3">
                  <OwnerOsMark size={32} className="max-w-[min(100%,11rem)]" title="NET WORTH" />
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
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-2"
                style={{ paddingBottom: 'max(0.75rem, var(--oo-safe-bottom))' }}
              >
                {ownerNavGroups.map((group) => (
                  <div key={group.id} className="mb-4 last:mb-0">
                    <p className="oo-nav-group-title px-2 pb-1">{group.title}</p>
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const active = isNavActive(pathname ?? '', item.href);
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={closeMenu}
                            className="oo-nav-link flex min-h-11 items-center gap-3 px-3"
                            data-active={active ? 'true' : 'false'}
                          >
                            <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                            <span className="font-medium">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
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
