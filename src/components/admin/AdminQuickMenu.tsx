'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export type QuickActionId = 'sale_express' | 'deposit_express' | 'refund_deposit';

const ACTIONS: Array<{
  id: QuickActionId;
  label: string;
  description: string;
  accent: string;
}> = [
  {
    id: 'sale_express',
    label: 'Sale Express',
    description: 'Walk-in booking, rent & invoice POS',
    accent: 'border-[#FF5A1F]/40 bg-[#FF5A1F]/10 hover:bg-[#FF5A1F]/20',
  },
  {
    id: 'deposit_express',
    label: 'Deposit Express',
    description: 'Collect security deposits only',
    accent: 'border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20',
  },
  {
    id: 'refund_deposit',
    label: 'Refund of Deposit',
    description: 'Refund, transfer, or deduct deposit wallet',
    accent: 'border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20',
  },
];

const BILLING_EXCLUDED_ACTIONS: QuickActionId[] = ['deposit_express', 'refund_deposit', 'sale_express'];

export function AdminQuickMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  function openAction(id: QuickActionId) {
    setMenuOpen(false);
    if (id === 'sale_express') {
      router.push('/admin/express-booking');
      return;
    }
    if (id === 'deposit_express') {
      router.push('/admin/deposit-express');
      return;
    }
    router.push('/admin/refunds');
  }

  const visibleActions = pathname.startsWith('/admin/billing')
    ? ACTIONS.filter((a) => !BILLING_EXCLUDED_ACTIONS.includes(a.id))
    : ACTIONS;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-apg-silver hover:bg-white/5 hover:text-white"
        aria-label="Quick actions"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <span className="grid grid-cols-3 gap-0.5" aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="h-1 w-1 rounded-full bg-current" />
          ))}
        </span>
      </button>
      {menuOpen ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 w-[min(100vw-2rem,20rem)] rounded-xl border border-white/10 bg-[#1A1F27] p-3 shadow-2xl"
        >
          <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
            Quick actions
          </p>
          <p className="px-1 pb-3 text-[11px] text-apg-silver">
            Sale, deposit collection, and deposit refunds — one tap each.
          </p>
          <div className="grid grid-cols-1 gap-2">
            {visibleActions.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => openAction(item.id)}
                className={`rounded-lg border px-3 py-3 text-left transition ${item.accent}`}
              >
                <span className="block text-xs font-semibold text-white">{item.label}</span>
                <span className="mt-0.5 block text-[10px] leading-tight text-apg-silver">
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
