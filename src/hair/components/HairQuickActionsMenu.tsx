'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/src/hair/lib/utils';

const ACTIONS = [
  {
    id: 'express_sale',
    label: 'Express Sale',
    description: 'Quick Sale · walk-in billing',
    href: '/quick-sale',
  },
  {
    id: 'advance_payment',
    label: 'Advance Payment',
    description: 'Add money to customer wallet · no invoice',
    href: '/advance-payment',
  },
] as const;

export function HairQuickActionsMenu() {
  const router = useRouter();
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
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--fyh-border)] text-fyh-text-secondary transition hover:bg-white/5 hover:text-fyh-text"
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
          className="absolute left-0 top-full z-50 mt-2 w-[min(100vw-2rem,18rem)] overflow-hidden rounded-xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-2 shadow-xl"
        >
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wide text-fyh-text-muted">
            Quick actions
          </p>
          <div className="grid gap-1.5">
            {ACTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  router.push(item.href);
                }}
                className={cn(
                  'rounded-lg border border-[color:var(--fyh-border)] px-3 py-3 text-left transition',
                  'hover:border-fyh-accent/40 hover:bg-fyh-forest/15',
                )}
              >
                <span className="block text-sm font-semibold text-fyh-text">{item.label}</span>
                <span className="mt-0.5 block text-xs leading-tight text-fyh-text-muted">
                  {item.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
