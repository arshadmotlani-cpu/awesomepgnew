'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import {
  quickAdvanceDepositAction,
  quickCreateRentInvoiceAction,
  quickOfflineDepositAction,
  quickRefundSettlementAction,
} from '@/app/(admin)/admin/quick-actions/actions';
import { QuickActionDialog } from '@/src/components/admin/quickActions/QuickActionDialog';
import { ExpressBookingSheet } from '@/src/components/admin/expressBooking/ExpressBookingSheet';
import { QuickActionResidentStep } from '@/src/components/admin/quickActions/QuickActionResidentStep';
import {
  type ResidentQuickResult,
} from '@/src/components/admin/quickActions/ResidentQuickSearch';
import { paiseToInr } from '@/src/lib/format';

export type QuickActionId =
  | 'advance_deposit'
  | 'offline_deposit'
  | 'rent_invoice'
  | 'electricity'
  | 'refund'
  | 'express_sale';

const ACTIONS: Array<{
  id: QuickActionId;
  label: string;
  description: string;
  accent: string;
}> = [
  {
    id: 'advance_deposit',
    label: 'Advance Deposit',
    description: 'Fast deposit ledger entry',
    accent: 'border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20',
  },
  {
    id: 'offline_deposit',
    label: 'Offline Deposit',
    description: 'Cash / UPI with reason',
    accent: 'border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20',
  },
  {
    id: 'rent_invoice',
    label: 'Rent Invoice',
    description: 'Create monthly rent bill',
    accent: 'border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20',
  },
  {
    id: 'electricity',
    label: 'Electricity Bill',
    description: 'Room meter → invoices',
    accent: 'border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20',
  },
  {
    id: 'refund',
    label: 'Refund / Settlement',
    description: 'Deposit refund or vacating',
    accent: 'border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20',
  },
  {
    id: 'express_sale',
    label: 'Express Booking',
    description: 'Walk-in booking console',
    accent: 'border-[#FF5A1F]/40 bg-[#FF5A1F]/10 hover:bg-[#FF5A1F]/20 col-span-2',
  },
];

const DIALOG_META: Record<QuickActionId, { title: string; description: string }> = {
  advance_deposit: {
    title: 'Advance Deposit',
    description: 'Record a deposit payment without assigning beds or creating invoices.',
  },
  offline_deposit: {
    title: 'Record Offline Deposit',
    description: 'Cash, UPI, or bank transfer — writes to deposit wallet ledger.',
  },
  rent_invoice: {
    title: 'Create Rent Invoice',
    description: 'Generate or update the monthly rent invoice for one tenant.',
  },
  electricity: {
    title: 'Create Electricity Bill',
    description: 'Opens the room meter form — splits across residents automatically.',
  },
  refund: {
    title: 'Refund / Vacating Settlement',
    description: 'Quick deposit refund or jump to full settlement workflow.',
  },
  express_sale: {
    title: 'Express Booking',
    description: 'Create a booking like the resident flow — bed, stay type, rent, and deposit in one place.',
  },
};

function ActionFormShell({
  children,
  onSubmit,
  pending,
  submitLabel,
  error,
  success,
}: {
  children: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void;
  pending: boolean;
  submitLabel: string;
  error: string | null;
  success: string | null;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {children}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
      >
        {pending ? 'Saving…' : submitLabel}
      </button>
      {success ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {success}
        </p>
      ) : null}
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </form>
  );
}

function DepositForm({ mode, onDone }: { mode: 'advance' | 'offline'; onDone: () => void }) {
  const [selected, setSelected] = useState<ResidentQuickResult | null>(null);
  const [amountInr, setAmountInr] = useState('');
  const [note, setNote] = useState('');
  const [method, setMethod] = useState('cash');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent, ctxBookingId: string | null) {
    e.preventDefault();
    if (!selected) return;
    const amount = Number.parseFloat(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const payload = {
        customerId: selected.id,
        bookingId: selected.bookingId ?? ctxBookingId,
        amountInr: amount,
      };
      const result =
        mode === 'advance'
          ? await quickAdvanceDepositAction({ ...payload, note })
          : await quickOfflineDepositAction({
              ...payload,
              reason: note,
              paymentMethod: method,
            });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(result.message);
      setAmountInr('');
      setNote('');
      setTimeout(onDone, 1200);
    });
  }

  return (
    <QuickActionResidentStep selected={selected} onSelect={setSelected}>
      {({ ctx }) => (
        <ActionFormShell
          onSubmit={(e) => submit(e, ctx?.bookingId ?? null)}
          pending={pending}
          submitLabel={mode === 'advance' ? 'Record advance deposit' : 'Record offline deposit'}
          error={error}
          success={success}
        >
          <label className="block text-xs text-apg-silver">
            Amount (₹)
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={amountInr}
              onChange={(e) => setAmountInr(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
            />
          </label>
          {mode === 'offline' ? (
            <label className="block text-xs text-apg-silver">
              Payment method
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank">Bank transfer</option>
              </select>
            </label>
          ) : null}
          <label className="block text-xs text-apg-silver">
            {mode === 'advance' ? 'Note (optional)' : 'Reason'}
            <input
              type="text"
              required={mode === 'offline'}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
            />
          </label>
        </ActionFormShell>
      )}
    </QuickActionResidentStep>
  );
}

function RentInvoiceForm({ onDone }: { onDone: () => void }) {
  const [selected, setSelected] = useState<ResidentQuickResult | null>(null);
  const [amountInr, setAmountInr] = useState('');
  const [billingMonth, setBillingMonth] = useState(new Date().toISOString().slice(0, 7));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent, ctxBookingId: string | null) {
    e.preventDefault();
    if (!selected) return;
    const amount = Number.parseFloat(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await quickCreateRentInvoiceAction({
        customerId: selected.id,
        bookingId: selected.bookingId ?? ctxBookingId,
        billingMonth,
        amountInr: amount,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(result.message);
      setTimeout(onDone, 1200);
    });
  }

  return (
    <QuickActionResidentStep selected={selected} onSelect={setSelected}>
      {({ ctx }) => (
        <RentInvoiceFields
          ctx={ctx}
          amountInr={amountInr}
          setAmountInr={setAmountInr}
          billingMonth={billingMonth}
          setBillingMonth={setBillingMonth}
          onSubmit={(e) => submit(e, ctx?.bookingId ?? null)}
          pending={pending}
          error={error}
          success={success}
        />
      )}
    </QuickActionResidentStep>
  );
}

function RentInvoiceFields({
  ctx,
  amountInr,
  setAmountInr,
  billingMonth,
  setBillingMonth,
  onSubmit,
  pending,
  error,
  success,
}: {
  ctx: import('@/app/(admin)/admin/quick-actions/actions').ResidentQuickContext | null;
  amountInr: string;
  setAmountInr: (v: string) => void;
  billingMonth: string;
  setBillingMonth: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  pending: boolean;
  error: string | null;
  success: string | null;
}) {
  useEffect(() => {
    if (ctx && ctx.monthlyRentPaise > 0 && !amountInr) {
      setAmountInr(String(ctx.monthlyRentPaise / 100));
    }
  }, [ctx, amountInr, setAmountInr]);

  return (
    <ActionFormShell
      onSubmit={onSubmit}
      pending={pending}
      submitLabel="Create rent invoice"
      error={error}
      success={success}
    >
      <label className="block text-xs text-apg-silver">
        Billing month
        <input
          type="month"
          required
          value={billingMonth}
          onChange={(e) => setBillingMonth(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="block text-xs text-apg-silver">
        Rent amount (₹)
        {ctx && ctx.monthlyRentPaise > 0 ? (
          <span className="ml-1 text-[10px] text-emerald-300">
            auto · {paiseToInr(ctx.monthlyRentPaise)}
          </span>
        ) : null}
        <input
          type="number"
          min="0.01"
          step="0.01"
          required
          value={amountInr}
          onChange={(e) => setAmountInr(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
        />
      </label>
    </ActionFormShell>
  );
}


function ElectricityForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ResidentQuickResult | null>(null);

  return (
    <QuickActionResidentStep selected={selected} onSelect={setSelected}>
      {({ ctx }) => {
        const roomId = selected?.roomId ?? ctx?.roomId ?? null;
        return (
          <div className="space-y-3">
            {roomId ? (
              <>
                <p className="text-xs text-apg-silver">
                  Opens the meter form for{' '}
                  <span className="text-white">
                    {ctx?.pgName ?? selected?.pgName} · Room {ctx?.roomNumber ?? selected?.roomNumber}
                  </span>
                  . Bills split across room residents automatically.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    router.push(`/admin/electricity/new?roomId=${roomId}`);
                    onDone();
                  }}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500"
                >
                  Open electricity bill form
                </button>
              </>
            ) : (
              <p className="text-xs text-amber-200">
                This resident has no room assignment yet. Assign a bed first, then generate the
                electricity bill for their room.
              </p>
            )}
          </div>
        );
      }}
    </QuickActionResidentStep>
  );
}

function RefundForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  return (
    <div className="space-y-4 text-sm">
      <p className="text-apg-silver">
        Quick deposit refunds are disabled. All vacating refunds must go through{' '}
        <strong className="text-white">Checkout Settlements</strong> so notice deduction,
        electricity, and payout are handled in one audited workflow.
      </p>
      <button
        type="button"
        onClick={() => {
          router.push('/admin/checkout-settlements');
          onDone();
        }}
        className="w-full rounded-lg bg-[#FF5A1F] px-4 py-2.5 font-semibold text-white hover:brightness-110"
      >
        Open Checkout Settlements
      </button>
    </div>
  );
}

const BILLING_EXCLUDED_ACTIONS: QuickActionId[] = [
  'advance_deposit',
  'offline_deposit',
  'refund',
  'express_sale',
];

export function AdminQuickMenu() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState<QuickActionId | null>(null);
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
    setActive(null);
  }, [pathname]);

  function closeDialog() {
    setActive(null);
  }

  function openAction(id: QuickActionId) {
    setMenuOpen(false);
    setActive(id);
  }

  const meta = active ? DIALOG_META[active] : null;
  const visibleActions = pathname.startsWith('/admin/billing')
    ? ACTIONS.filter((a) => !BILLING_EXCLUDED_ACTIONS.includes(a.id))
    : ACTIONS;

  return (
    <>
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
            className="absolute left-0 top-full z-50 mt-2 w-[min(100vw-2rem,24rem)] rounded-xl border border-white/10 bg-[#1A1F27] p-3 shadow-2xl"
          >
            <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
              Quick actions
            </p>
            <p className="px-1 pb-3 text-[11px] text-apg-silver">
              One-click operational tasks — not module navigation.
            </p>
            <div className="grid grid-cols-2 gap-2">
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

      {meta && active && active !== 'express_sale' ? (
        <QuickActionDialog
          open={active !== null}
          title={meta.title}
          description={meta.description}
          onClose={closeDialog}
          wide={false}
        >
          {active === 'advance_deposit' ? <DepositForm mode="advance" onDone={closeDialog} /> : null}
          {active === 'offline_deposit' ? <DepositForm mode="offline" onDone={closeDialog} /> : null}
          {active === 'rent_invoice' ? <RentInvoiceForm onDone={closeDialog} /> : null}
          {active === 'electricity' ? <ElectricityForm onDone={closeDialog} /> : null}
          {active === 'refund' ? <RefundForm onDone={closeDialog} /> : null}
        </QuickActionDialog>
      ) : null}

      {active === 'express_sale' ? (
        <div className="fixed inset-0 z-[100000] flex flex-col bg-[#0a0d12]">
          <ExpressBookingSheet onClose={closeDialog} />
        </div>
      ) : null}
    </>
  );
}
