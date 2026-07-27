'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { HairSidebar } from '@/src/hair/components/HairSidebar';
import { Button } from '@/src/hair/components/ui/button';

/** Mobile drawer wrapper — desktop sidebar stays in layout. */
export function HairMobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex items-center gap-2 border-b border-[color:var(--fyh-border)] px-4 py-3 md:hidden">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
        <Link href="/dashboard" className="fyh-display text-lg font-semibold">
          For Your Hair
        </Link>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-fyh-elevated shadow-2xl">
            <div className="flex justify-end p-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <HairSidebar className="!flex h-full w-full border-0" />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
