'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/src/hair/components/ui/button';

export function DashboardNewMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button type="button" size="sm" onClick={() => setOpen((v) => !v)} className="gap-1">
        + New
        <ChevronDown className="h-4 w-4 opacity-70" />
      </Button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-2 min-w-[12rem] overflow-hidden rounded-xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] py-1 shadow-xl">
            <Link
              href="/quick-sale"
              className="block px-4 py-2.5 text-sm font-medium text-fyh-text hover:bg-white/5"
              onClick={() => setOpen(false)}
            >
              Quick Sale
            </Link>
            <Link
              href="/appointments"
              className="block px-4 py-2.5 text-sm text-fyh-text-secondary hover:bg-white/5"
              onClick={() => setOpen(false)}
            >
              New appointment
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
