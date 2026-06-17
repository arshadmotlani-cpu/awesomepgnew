'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import {
  quickAdvanceDepositAction,
  quickCreateRentInvoiceAction,
  quickExpressSaleAction,
  quickOfflineDepositAction,
  quickRefundSettlementAction,
} from '@/app/(admin)/admin/quick-actions/actions';
import { QuickActionDialog } from '@/src/components/admin/quickActions/QuickActionDialog';
import {
  ResidentQuickSearch,
  type ResidentQuickResult,
} from '@/src/components/admin/quickActions/ResidentQuickSearch';

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
    label: 'Express Sale',
    description: 'Instant ad-hoc charge',
    accent: 'border-[#FF5A1F]/40 bg-[#FF5A1F]/10 hover:bg-[#FF5A1F]/20',
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
    title: 'Express Sale',
    description: 'POS-style ad-hoc charge — instant invoice linked to tenant.',
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected?.bookingId) {
      setError('Select a tenant with an active booking.');
      return;
    }
    const amount = Number.parseFloat(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result =
        mode === 'advance'
          ? await quickAdvanceDepositAction({
              bookingId: selected.bookingId!,
              customerId: selected.id,
              amountInr: amount,
              note,
            })
          : await quickOfflineDepositAction({
              bookingId: selected.bookingId!,
              amountInr: amount,
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
    <ActionFormShell
      onSubmit={submit}
      pending={pending}
      submitLabel={mode === 'advance' ? 'Record advance deposit' : 'Record offline deposit'}
      error={error}
      success={success}
    >
      <ResidentQuickSearch selected={selected} onSelect={setSelected} />
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
  );
}

function RentInvoiceForm({ onDone }: { onDone: () => void }) {
  const [selected, setSelected] = useState<ResidentQuickResult | null>(null);
  const [amountInr, setAmountInr] = useState('');
  const [billingMonth, setBillingMonth] = useState(new Date().toISOString().slice(0, 7));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected?.bookingId) {
      setError('Select a tenant with an active booking.');
      return;
    }
    const amount = Number.parseFloat(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await quickCreateRentInvoiceAction({
        bookingId: selected.bookingId!,
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
    <ActionFormShell
      onSubmit={submit}
      pending={pending}
      submitLabel="Create rent invoice"
      error={error}
      success={success}
    >
      <ResidentQuickSearch selected={selected} onSelect={setSelected} />
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

function ExpressSaleForm({ onDone }: { onDone: () => void }) {
  const [selected, setSelected] = useState<ResidentQuickResult | null>(null);
  const [saleType, setSaleType] = useState<
    'rent_adjustment' | 'penalty' | 'extra_service' | 'misc'
  >('misc');
  const [amountInr, setAmountInr] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) {
      setError('Select a tenant.');
      return;
    }
    const amount = Number.parseFloat(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await quickExpressSaleAction({
        customerId: selected.id,
        bookingId: selected.bookingId ?? undefined,
        saleType,
        amountInr: amount,
        note,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(result.message);
      setTimeout(onDone, 1500);
    });
  }

  return (
    <ActionFormShell
      onSubmit={submit}
      pending={pending}
      submitLabel="Create express sale"
      error={error}
      success={success}
    >
      <ResidentQuickSearch selected={selected} onSelect={setSelected} requireBooking={false} />
      <label className="block text-xs text-apg-silver">
        Charge type
        <select
          value={saleType}
          onChange={(e) => setSaleType(e.target.value as typeof saleType)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
        >
          <option value="rent_adjustment">Rent adjustment</option>
          <option value="penalty">Penalty</option>
          <option value="extra_service">Extra service</option>
          <option value="misc">Misc charge</option>
        </select>
      </label>
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
      <label className="block text-xs text-apg-silver">
        Note (optional)
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Description shown on invoice"
          className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
        />
      </label>
    </ActionFormShell>
  );
}

function RefundForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ResidentQuickResult | null>(null);
  const [amountInr, setAmountInr] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected?.bookingId) {
      setError('Select a tenant with an active booking.');
      return;
    }
    const amount = Number.parseFloat(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (!reason.trim()) {
      setError('Reason is required.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await quickRefundSettlementAction({
        bookingId: selected.bookingId!,
        amountInr: amount,
        reason,
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
    <div className="space-y-3">
      <ResidentQuickSearch selected={selected} onSelect={setSelected} />
      {selected?.bookingId ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => router.push(`/admin/deposits/${selected.bookingId}`)}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-apg-silver hover:text-white"
          >
            Full deposit settlement →
          </button>
          <button
            type="button"
            onClick={() => router.push('/admin/vacating')}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-apg-silver hover:text-white"
          >
            Vacating queue →
          </button>
        </div>
      ) : null}
      <ActionFormShell
        onSubmit={submit}
        pending={pending}
        submitLabel="Record deposit refund"
        error={error}
        success={success}
      >
        <label className="block text-xs text-apg-silver">
          Refund amount (₹)
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
        <label className="block text-xs text-apg-silver">
          Reason
          <input
            type="text"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
          />
        </label>
      </ActionFormShell>
    </div>
  );
}

export function AdminQuickMenu() {
  const router = useRouter();
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
    if (id === 'electricity') {
      setMenuOpen(false);
      router.push('/admin/electricity/new');
      return;
    }
    setMenuOpen(false);
    setActive(id);
  }

  const meta = active ? DIALOG_META[active] : null;

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
              {ACTIONS.map((item) => (
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

      {meta && active ? (
        <QuickActionDialog
          open={active !== null}
          title={meta.title}
          description={meta.description}
          onClose={closeDialog}
        >
          {active === 'advance_deposit' ? <DepositForm mode="advance" onDone={closeDialog} /> : null}
          {active === 'offline_deposit' ? <DepositForm mode="offline" onDone={closeDialog} /> : null}
          {active === 'rent_invoice' ? <RentInvoiceForm onDone={closeDialog} /> : null}
          {active === 'express_sale' ? <ExpressSaleForm onDone={closeDialog} /> : null}
          {active === 'refund' ? <RefundForm onDone={closeDialog} /> : null}
        </QuickActionDialog>
      ) : null}
    </>
  );
}
