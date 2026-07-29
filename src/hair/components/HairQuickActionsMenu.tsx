'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Banknote, Receipt, type LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/src/hair/lib/utils';

const ACTIONS: Array<{
  id: string;
  label: string;
  description: string;
  href: string;
  Icon: LucideIcon;
}> = [
  {
    id: 'express_sale',
    label: 'Express Sale',
    description: 'Walk-in billing',
    href: '/quick-sale',
    Icon: Receipt,
  },
  {
    id: 'advance_payment',
    label: 'Advance Payment',
    description: 'Receive advance without invoice',
    href: '/advance-payment',
    Icon: Banknote,
  },
];

export function HairQuickActionsMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 56, left: 16 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPanelPos({
      top: r.bottom + 10,
      left: Math.max(12, Math.min(r.left, window.innerWidth - 17 * 16 - 12)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (
        panelRef.current?.contains(t) ||
        triggerRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const panel =
    open && mounted ? (
      <>
        <button
          type="button"
          aria-label="Close quick actions"
          className="fixed inset-0 z-[500] bg-black/25 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
        />
        <div
          ref={panelRef}
          role="menu"
          className="fixed z-[510] w-[min(calc(100vw-1.5rem),17rem)] overflow-hidden rounded-xl border border-[color:var(--fyh-border-strong)] bg-[color:var(--fyh-bg-elevated)] p-2 shadow-[0_20px_56px_rgba(0,0,0,0.45)]"
          style={{ top: panelPos.top, left: panelPos.left }}
        >
          <p className="px-1.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-fyh-text-secondary">
            Quick actions
          </p>
          <div className="space-y-1.5">
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
                  'flex w-full items-start gap-2.5 rounded-lg px-2 py-2.5 text-left transition',
                  'border border-transparent bg-[color:var(--fyh-bg-surface)]/80',
                  'hover:border-[color:var(--fyh-border-strong)] hover:bg-[color:var(--fyh-bg-surface)] hover:shadow-sm',
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fyh-forest/25 text-fyh-accent">
                  <item.Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 pt-0.5">
                  <span className="block text-[13px] font-semibold text-fyh-text">{item.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-fyh-text-secondary">
                    {item.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </>
    ) : null;

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg border transition',
          'border-[color:var(--fyh-border-strong)] bg-[color:var(--fyh-bg-surface)]/60 text-fyh-text',
          'hover:border-fyh-accent/45 hover:bg-[color:var(--fyh-bg-surface)] hover:shadow-sm',
          open && 'border-fyh-accent/50 bg-[color:var(--fyh-bg-surface)] shadow-sm',
        )}
        aria-label="Quick actions"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="grid grid-cols-3 gap-0.5" aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="h-1 w-1 rounded-full bg-current opacity-90" />
          ))}
        </span>
      </button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
