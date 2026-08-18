'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Banknote, Receipt, ReceiptText, type LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NewExpenseModal } from '@/src/hair/components/expenses/NewExpenseModal';
import { cn } from '@/src/hair/lib/utils';

type NavAction = {
  id: string;
  label: string;
  description: string;
  href: string;
  Icon: LucideIcon;
};

type ModalAction = {
  id: string;
  label: string;
  description: string;
  Icon: LucideIcon;
  opens: 'expense_modal';
};

const NAV_ACTIONS: NavAction[] = [
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

const MODAL_ACTIONS: ModalAction[] = [
  {
    id: 'add_expense',
    label: 'Add Expense',
    description: 'Record a new business expense',
    Icon: ReceiptText,
    opens: 'expense_modal',
  },
];

type Props = {
  staffName: string;
};

export function HairQuickActionsMenu({ staffName }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
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
          <p className="fyh-kpi-label px-1.5 pb-2">Quick actions</p>
          <div className="space-y-1.5">
            {NAV_ACTIONS.map((item) => (
              <QuickActionNavRow
                key={item.id}
                item={item}
                onNavigate={(href) => {
                  setOpen(false);
                  router.push(href);
                }}
              />
            ))}
            {MODAL_ACTIONS.map((item) => (
              <QuickActionModalRow
                key={item.id}
                item={item}
                onSelect={() => {
                  setOpen(false);
                  setExpenseModalOpen(true);
                }}
              />
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
          'hover:border-[color:var(--fyh-border-hover)] hover:bg-[color:var(--fyh-bg-surface)] hover:shadow-sm',
          open && 'border-[color:var(--fyh-accent)] bg-[color:var(--fyh-bg-surface)] shadow-sm',
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
      <NewExpenseModal
        open={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        staffName={staffName}
      />
    </div>
  );
}

function QuickActionNavRow({
  item,
  onNavigate,
}: {
  item: NavAction;
  onNavigate: (href: string) => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => onNavigate(item.href)}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg px-2 py-2.5 text-left transition',
        'border border-transparent bg-[color:var(--fyh-bg-surface)]/80',
        'hover:border-[color:var(--fyh-border-strong)] hover:bg-[color:var(--fyh-bg-surface)] hover:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fyh-accent)]',
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--fyh-nav-active-bg)] text-fyh-accent">
        <item.Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="block text-[13px] font-semibold text-fyh-text">{item.label}</span>
        <span className="mt-0.5 block text-xs leading-snug text-fyh-text-secondary">
          {item.description}
        </span>
      </span>
    </button>
  );
}

function QuickActionModalRow({
  item,
  onSelect,
}: {
  item: ModalAction;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-label={item.label}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg px-2 py-2.5 text-left transition',
        'border border-transparent bg-[color:var(--fyh-bg-surface)]/80',
        'hover:border-[color:var(--fyh-border-strong)] hover:bg-[color:var(--fyh-bg-surface)] hover:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fyh-accent)]',
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--fyh-nav-active-bg)] text-fyh-accent">
        <item.Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="block text-[13px] font-semibold text-fyh-text">{item.label}</span>
        <span className="mt-0.5 block text-xs leading-snug text-fyh-text-secondary">
          {item.description}
        </span>
      </span>
    </button>
  );
}
