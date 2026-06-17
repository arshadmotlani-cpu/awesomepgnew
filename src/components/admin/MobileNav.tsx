'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconClose, IconMenu } from './icons';
import { Sidebar } from './Sidebar';

export function MobileNav() {
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
            className="fixed inset-0 z-[200] lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
          >
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={closeMenu}
              aria-hidden
            />
            <div className="absolute inset-y-0 left-0 flex w-full max-w-[min(100vw,20rem)] flex-col bg-[#1A1F27] shadow-2xl">
              <div className="flex shrink-0 items-center justify-end border-b border-white/10 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <button
                  type="button"
                  onClick={closeMenu}
                  aria-label="Close navigation menu"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-white hover:bg-white/10"
                >
                  <IconClose />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
                <Sidebar onNavigate={closeMenu} variant="drawer" />
              </div>
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
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#1A1F27] text-white hover:bg-white/10 lg:hidden"
        aria-label="Open navigation menu"
        aria-expanded={menuOpen}
      >
        <IconMenu />
      </button>
      {drawer}
    </>
  );
}
