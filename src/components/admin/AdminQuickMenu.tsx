'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const QUICK_LINKS = [
  { href: '/admin/deposits/advance', label: 'Advance Deposit', description: 'Record offline deposit' },
  { href: '/admin/deposits', label: 'Deposits', description: 'Balances & refunds' },
  { href: '/admin/revenue', label: 'Revenue', description: 'Income & billing' },
  { href: '/admin/revenue/billing', label: 'Billing', description: 'Invoices & collections' },
  { href: '/admin/pgs', label: 'Rooms', description: 'PGs & bed map' },
  { href: '/admin/residents', label: 'Tenants', description: 'Residents & assign' },
  { href: '/admin/invoices', label: 'Invoices', description: 'Unified invoice registry' },
  { href: '/admin/analytics', label: 'Reports', description: 'Analytics & traffic' },
  { href: '/admin/settings', label: 'Settings', description: 'Admin & cleanup' },
] as const;

export function AdminQuickMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-apg-silver hover:bg-white/5 hover:text-white"
        aria-label="Quick actions"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="grid grid-cols-3 gap-0.5" aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="h-1 w-1 rounded-full bg-current" />
          ))}
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 w-[min(100vw-2rem,22rem)] rounded-xl border border-white/10 bg-[#1A1F27] p-2 shadow-2xl"
        >
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
            Quick actions
          </p>
          <div className="grid grid-cols-3 gap-1">
            {QUICK_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className="rounded-lg px-2 py-2.5 text-center transition hover:bg-white/5"
              >
                <span className="block text-xs font-semibold text-white">{item.label}</span>
                <span className="mt-0.5 block text-[10px] leading-tight text-apg-silver">
                  {item.description}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
