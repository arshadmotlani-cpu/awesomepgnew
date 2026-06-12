'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { IconClose, IconMenu } from './icons';
import { Sidebar } from './Sidebar';

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#1A1F27] text-white hover:bg-white/10 lg:hidden"
        aria-label="Open navigation menu"
      >
        <IconMenu />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 flex max-w-[min(100vw,18rem)] shadow-2xl">
            <div className="relative flex h-full w-64 flex-col">
              <Sidebar
                key={pathname}
                onNavigate={() => setOpen(false)}
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-white hover:bg-white/10"
              >
                <IconClose />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
