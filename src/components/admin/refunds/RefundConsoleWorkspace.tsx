'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useCallback, useEffect, useState, useTransition } from 'react';
import {
  DEDUCTION_CATEGORY_LABELS,
  type DeductionCategory,
} from '@/src/lib/financial/deductionCategories';
import { formatDate, formatDateTime, paiseToInr } from '@/src/lib/format';
import {
  posGlassCard,
  posInputClass,
} from '@/src/components/admin/expressBooking/expressBookingStyles';
import {
  deductDepositAction,
  initialRefundActionState,
  loadRefundConsoleWorkspaceAction,
  markRefundPaidAction,
  searchRefundConsoleAction,
  type RefundActionState,
} from '@/app/(admin)/admin/refunds/actions';
import type {
  RefundConsoleBookingRow,
  RefundConsoleWorkspace,
} from '@/src/services/refundConsole';

function ActionBanner({ state }: { state: RefundActionState }) {
  if (state.status === 'idle') return null;
  const cls =
    state.status === 'ok'
      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
      : 'border-red-400/30 bg-red-500/10 text-red-100';
  return <p className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{state.message}</p>;
}

function SummaryMetric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#12161C]/80 px-4 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-apg-muted">{label}</dt>
      <dd
        className={`mt-1 text-lg font-semibold tabular-nums ${highlight ? 'text-[#FF5A1F]' : 'text-white'}`}
      >
        {value}
      </dd>
    </div>
  );
}

function RefundSearchHero({
  onSelect,
  loading,
  results,
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  results: RefundConsoleBookingRow[];
  loading: boolean;
  onSelect: (row: RefundConsoleBookingRow) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-8">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-white">Find resident</h2>
        <p className="mt-2 text-sm text-apg-silver">
          Search by name, phone, or booking code — selecting opens the payout workspace immediately.
        </p>
      </div>
      <label className="block">
        <span className="sr-only">Search</span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Name, phone, or booking code"
          autoFocus
          className="w-full rounded-2xl border border-white/15 bg-[#0d1118]/90 px-5 py-4 text-lg text-white placeholder:text-apg-muted focus:border-[#FF5A1F]/50 focus:outline-none focus:ring-2 focus:ring-[#FF5A1F]/25"
        />
      </label>
      {loading ? <p className="text-center text-sm text-apg-silver">Searching…</p> : null}
      {results.length > 0 ? (
        <ul className="overflow-hidden rounded-2xl border border-white/10 bg-[#12161C]/80">
          {results.map((row) => (
            <li key={row.bookingId}>
              <button
                type="button"
                onClick={() => onSelect(row)}
                className="flex w-full flex-col gap-1 border-b border-white/5 px-5 py-4 text-left transition hover:bg-white/[0.04] last:border-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-base font-semibold text-white">{row.customerName}</p>
                  <p className="text-sm text-apg-silver">
                    {row.bookingCode}
                    {row.bedLabel ? ` · ${row.bedLabel}` : ''}
                  </p>
                </div>
                <p className="text-sm font-semibold text-emerald-300">
                  Refundable {paiseToInr(row.wallet.remainingDepositPaise)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {query.trim().length >= 2 && !loading && results.length === 0 ? (
        <p className="text-center text-sm text-apg-silver">No bookings with a deposit wallet found.</p>
      ) : null}
    </div>
  );
}

function PayoutWorkspace({
  workspace,
  onChangeResident,
  onRefresh,
}: {
  workspace: RefundConsoleWorkspace;
  onChangeResident: () => void;
  onRefresh: () => void;
}) {
  const [deductState, deductAction, deductPending] = useActionState(
    deductDepositAction.bind(null, workspace.bookingId),
    initialRefundActionState,
  );
  const [payState, payAction, payPending] = useActionState(
    markRefundPaidAction.bind(null, workspace.bookingId),
    initialRefundActionState,
  );

  useEffect(() => {
    if (deductState.status === 'ok' || payState.status === 'ok') {
      onRefresh();
    }
  }, [deductState.status, payState.status, onRefresh]);

  const defaultRefundInr = (workspace.suggestedRefundPaise / 100).toFixed(2);
  const defaultUpi = workspace.checkout?.payoutUpiId ?? '';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-10">
      <div className={`${posGlassCard} flex flex-wrap items-start justify-between gap-4`}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-apg-muted">
            Refund payout workspace
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-white">{workspace.customerName}</h2>
          <p className="mt-1 text-sm text-apg-silver">
            {workspace.bookingCode}
            {workspace.pgName ? ` · ${workspace.pgName}` : ''}
            {workspace.bedLabel ? ` · ${workspace.bedLabel}` : ''}
          </p>
          <p className="mt-1 text-xs text-apg-muted">
            {workspace.customerPhone ?? '—'}
            {workspace.checkInDate ? ` · Check-in ${formatDate(workspace.checkInDate)}` : ''}
            {workspace.checkOutDate ? ` · Check-out ${formatDate(workspace.checkOutDate)}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onChangeResident}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-apg-silver hover:text-white"
        >
          Change resident
        </button>
      </div>

      <ActionBanner state={deductState.status !== 'idle' ? deductState : payState} />

      <section className={posGlassCard}>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-apg-muted">
          Deposit ledger summary
        </h3>
        <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryMetric label="Deposit collected" value={paiseToInr(workspace.wallet.depositPaidPaise)} />
          <SummaryMetric
            label="Deposit transferred"
            value={paiseToInr(workspace.wallet.depositTransferredPaise)}
          />
          <SummaryMetric
            label="Deposit already deducted"
            value={paiseToInr(workspace.wallet.depositUsedPaise)}
          />
          <SummaryMetric
            label="Refundable balance"
            value={paiseToInr(workspace.refundableBalancePaise)}
            highlight
          />
        </dl>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <SummaryMetric label="Refund paid" value={paiseToInr(workspace.wallet.refundPaidPaise)} />
          <SummaryMetric
            label="Electricity deductions"
            value={paiseToInr(workspace.wallet.electricityDeductionPaise)}
          />
          <SummaryMetric
            label="Policy deductions"
            value={paiseToInr(workspace.wallet.policyDeductionPaise)}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {workspace.deductions.length > 0 ? (
            <section className={posGlassCard}>
              <h3 className="text-sm font-semibold text-white">Previous deductions</h3>
              <ul className="mt-3 divide-y divide-white/10">
                {workspace.deductions.map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-medium text-white">{d.category}</p>
                      <p className="text-apg-silver">{d.reason}</p>
                      <p className="text-xs text-apg-muted">{formatDateTime(d.occurredAt)}</p>
                    </div>
                    <span className="shrink-0 font-semibold text-rose-200">
                      −{paiseToInr(d.amountPaise)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {workspace.transfers.length > 0 ? (
            <section className={posGlassCard}>
              <h3 className="text-sm font-semibold text-white">Transfer history</h3>
              <ul className="mt-3 divide-y divide-white/10">
                {workspace.transfers.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="text-apg-silver">{t.reason}</p>
                      <p className="text-xs text-apg-muted">{formatDateTime(t.occurredAt)}</p>
                    </div>
                    <span className="shrink-0 font-semibold text-amber-200">
                      −{paiseToInr(t.amountPaise)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className={posGlassCard}>
            <h3 className="text-sm font-semibold text-white">Add deduction</h3>
            <form action={deductAction} className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-xs text-apg-silver sm:col-span-2">
                Reason
                <input
                  name="reason"
                  required
                  placeholder="Describe why this amount is deducted"
                  className={posInputClass}
                />
              </label>
              <label className="block text-xs text-apg-silver">
                Category
                <select name="category" defaultValue="other" className={posInputClass}>
                  {(Object.keys(DEDUCTION_CATEGORY_LABELS) as DeductionCategory[]).map((key) => (
                    <option key={key} value={key}>
                      {DEDUCTION_CATEGORY_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-apg-silver">
                Amount (₹)
                <input
                  name="amountInr"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  className={posInputClass}
                />
              </label>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={deductPending}
                  className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:bg-white/[0.04] disabled:opacity-50"
                >
                  {deductPending ? 'Applying…' : 'Apply deduction'}
                </button>
              </div>
            </form>
          </section>
        </div>

        <aside className="space-y-6">
          <section className={`${posGlassCard} border-[#FF5A1F]/20`}>
            <h3 className="text-sm font-semibold text-white">Mark refund paid</h3>
            {workspace.checkout?.status === 'refund_pending' ? (
              <p className="mt-2 text-xs text-apg-silver">
                Checkout settlement approved — pay{' '}
                {paiseToInr(workspace.checkout.finalRefundPaise ?? 0)} to close the workflow.
              </p>
            ) : (
              <p className="mt-2 text-xs text-apg-silver">
                Record UPI or bank transfer against the deposit wallet.
              </p>
            )}
            <form action={payAction} className="mt-4 space-y-4">
              <label className="block text-xs text-apg-silver">
                Final refund amount (₹)
                <input
                  name="finalRefundInr"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={defaultRefundInr}
                  required
                  className={posInputClass}
                />
              </label>
              <label className="block text-xs text-apg-silver">
                UPI ID / payment reference
                <input
                  name="refundReference"
                  defaultValue={defaultUpi}
                  required
                  placeholder="UPI ID or transaction reference"
                  className={posInputClass}
                />
              </label>
              <label className="block text-xs text-apg-silver">
                Payment method
                <select name="refundMethod" defaultValue="upi" className={posInputClass}>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="block text-xs text-apg-silver">
                Notes (optional)
                <input name="refundNotes" className={posInputClass} />
              </label>
              <button
                type="submit"
                disabled={payPending || workspace.refundableBalancePaise <= 0}
                className="w-full rounded-xl bg-[#FF5A1F] py-3.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
              >
                {payPending ? 'Processing…' : 'Mark refund paid'}
              </button>
            </form>
          </section>

          <section className={posGlassCard}>
            <h3 className="text-sm font-semibold text-white">Wallet balance</h3>
            <p className="mt-2 text-3xl font-bold tabular-nums text-white">
              {paiseToInr(workspace.refundableBalancePaise)}
            </p>
            <p className="mt-1 text-xs text-apg-silver">Available to refund after deductions</p>
            {workspace.adminDepositRefundStatus === 'refunded' ? (
              <p className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                Booking deposit marked refunded
              </p>
            ) : null}
          </section>
        </aside>
      </div>

      <section className={posGlassCard}>
        <h3 className="text-sm font-semibold text-white">Timeline</h3>
        {workspace.timeline.length === 0 ? (
          <p className="mt-3 text-sm text-apg-silver">No ledger activity yet.</p>
        ) : (
          <ol className="mt-4 space-y-0">
            {workspace.timeline.map((event, index) => (
              <li key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
                {index < workspace.timeline.length - 1 ? (
                  <span className="absolute left-[7px] top-3 h-full w-px bg-white/10" aria-hidden />
                ) : null}
                <span className="relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[#FF5A1F] bg-[#0B0F14]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-white">{event.label}</p>
                    {event.amountPaise != null ? (
                      <p className="text-sm font-semibold tabular-nums text-apg-silver">
                        {paiseToInr(Math.abs(event.amountPaise))}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-sm text-apg-silver">{event.detail}</p>
                  <p className="text-xs text-apg-muted">{formatDateTime(event.occurredAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export function RefundConsoleWorkspace({
  initialBookingId,
  initialWorkspace,
}: {
  initialBookingId?: string | null;
  initialWorkspace?: RefundConsoleWorkspace | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RefundConsoleBookingRow[]>([]);
  const [searching, startSearch] = useTransition();
  const [loadingWorkspace, startLoadWorkspace] = useTransition();
  const [workspace, setWorkspace] = useState<RefundConsoleWorkspace | null>(initialWorkspace ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const openBooking = useCallback(
    (bookingId: string) => {
      setLoadError(null);
      startLoadWorkspace(async () => {
        const res = await loadRefundConsoleWorkspaceAction(bookingId);
        if (!res.ok) {
          setLoadError(res.error);
          setWorkspace(null);
          return;
        }
        setWorkspace(res.workspace);
        router.replace(`/admin/refunds?booking=${encodeURIComponent(bookingId)}`, { scroll: false });
      });
    },
    [router],
  );

  const refreshWorkspace = useCallback(() => {
    if (!workspace?.bookingId) return;
    void openBooking(workspace.bookingId);
  }, [openBooking, workspace?.bookingId]);

  useEffect(() => {
    if (initialBookingId && initialWorkspace && !workspace) {
      setWorkspace(initialWorkspace);
    }
  }, [initialBookingId, initialWorkspace, workspace]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      startSearch(async () => {
        const res = await searchRefundConsoleAction(trimmed);
        if (res.ok) setSearchResults(res.rows);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  function handleSelect(row: RefundConsoleBookingRow) {
    setQuery('');
    setSearchResults([]);
    openBooking(row.bookingId);
  }

  function handleChangeResident() {
    setWorkspace(null);
    setLoadError(null);
    setQuery('');
    router.replace('/admin/refunds', { scroll: false });
  }

  return (
    <div className="-mx-3 flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0B0F14] sm:-mx-4 lg:-mx-8">
      <header className="shrink-0 border-b border-white/10 bg-[#0B0F14]/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white sm:text-2xl">Refund Console</h1>
            <p className="text-sm text-apg-silver">
              Deposit refunds, deductions, and payout — final accounting workspace
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-6 sm:px-6 lg:px-8">
        {loadError ? (
          <div className="mx-auto mb-4 max-w-6xl rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {loadError}
          </div>
        ) : null}
        {loadingWorkspace ? (
          <p className="text-center text-sm text-apg-silver">Loading payout workspace…</p>
        ) : workspace ? (
          <PayoutWorkspace
            workspace={workspace}
            onChangeResident={handleChangeResident}
            onRefresh={refreshWorkspace}
          />
        ) : (
          <RefundSearchHero
            query={query}
            onQueryChange={setQuery}
            results={searchResults}
            loading={searching}
            onSelect={handleSelect}
          />
        )}
      </div>
    </div>
  );
}
