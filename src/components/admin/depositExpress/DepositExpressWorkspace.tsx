'use client';

import Link from 'next/link';
import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { initialDepositExpressActionState } from '@/app/(admin)/admin/deposit-express/actionState';
import {
  listDepositExpressBookingsAction,
  loadDepositExpressContextAction,
  searchDepositExpressAction,
  submitDepositExpressAction,
} from '@/app/(admin)/admin/deposit-express/actions';
import {
  posGlassCard,
  posInputClass,
} from '@/src/components/admin/expressBooking/expressBookingStyles';
import type { DepositExpressContext } from '@/src/services/depositExpress';
import type { RefundConsoleBookingRow } from '@/src/services/refundConsole';
import { paiseToInr } from '@/src/lib/format';

function SummaryMetric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#12161C]/80 px-4 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-apg-muted">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold tabular-nums ${highlight ? 'text-[#FF5A1F]' : 'text-white'}`}>
        {value}
      </dd>
    </div>
  );
}

function BookingPicker({
  rows,
  residentLabel,
  onSelect,
  onBack,
}: {
  rows: RefundConsoleBookingRow[];
  residentLabel: string;
  onSelect: (row: RefundConsoleBookingRow) => void;
  onBack: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-8">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-white">Select booking</h2>
        <p className="mt-2 text-sm text-apg-silver">
          {residentLabel} has {rows.length} booking{rows.length === 1 ? '' : 's'}.
        </p>
      </div>
      <ul className="overflow-hidden rounded-2xl border border-white/10 bg-[#12161C]/80">
        {rows.map((row) => (
          <li key={row.bookingId}>
            <button
              type="button"
              onClick={() => onSelect(row)}
              className="flex w-full flex-col gap-1 border-b border-white/5 px-5 py-4 text-left transition hover:bg-white/[0.04] last:border-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-base font-semibold text-white">{row.bookingCode}</p>
                <p className="text-sm text-apg-silver">
                  {row.status}
                  {row.bedLabel ? ` · ${row.bedLabel}` : ''}
                  {row.pgName ? ` · ${row.pgName}` : ''}
                </p>
              </div>
              <p className="text-sm font-semibold text-emerald-300">
                Wallet {paiseToInr(row.wallet.remainingDepositPaise)}
              </p>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onBack} className="text-sm text-apg-silver hover:text-white">
        ← Back to search
      </button>
    </div>
  );
}

function DepositWorkspace({
  context,
  onChangeResident,
  onSuccess,
}: {
  context: DepositExpressContext;
  onChangeResident: () => void;
  onSuccess: () => void;
}) {
  const [state, formAction, pending] = useActionState(submitDepositExpressAction, initialDepositExpressActionState);
  const [requiredInr, setRequiredInr] = useState(String(context.requiredDepositPaise / 100));
  const [paidInr, setPaidInr] = useState('0');

  useEffect(() => {
    if (state.status === 'ok') onSuccess();
  }, [state.status, onSuccess]);

  const requiredPaise = Math.round(Number(requiredInr) * 100) || 0;
  const paidPaise = Math.round(Number(paidInr) * 100) || 0;
  const projectedRemaining = Math.max(0, requiredPaise - context.alreadyPaidPaise - paidPaise);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">{context.customerName}</h2>
          <p className="mt-1 text-sm text-apg-silver">
            {context.bookingCode} · {context.pgName} · Room {context.roomNumber} · Bed {context.bedCode}
          </p>
        </div>
        <button
          type="button"
          onClick={onChangeResident}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs text-apg-silver hover:text-white"
        >
          Change resident
        </button>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryMetric label="Required deposit" value={paiseToInr(context.requiredDepositPaise)} />
        <SummaryMetric label="Already paid" value={paiseToInr(context.alreadyPaidPaise)} />
        <SummaryMetric label="Remaining due" value={paiseToInr(context.remainingDuePaise)} highlight />
        <SummaryMetric label="Wallet balance" value={paiseToInr(context.walletBalancePaise)} />
      </dl>

      {state.status === 'ok' ? (
        <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {state.message}
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {state.message}
        </p>
      ) : null}

      <form action={formAction} className={`${posGlassCard} space-y-4`}>
        <input type="hidden" name="bookingId" value={context.bookingId} />
        <h3 className="text-sm font-semibold text-white">Record deposit</h3>
        <p className="text-xs text-apg-silver">
          Deposit only — never affects rent or electricity. After save, projected remaining due:{' '}
          <span className="font-semibold text-white">{paiseToInr(projectedRemaining)}</span>
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs text-apg-silver">
            Required deposit (₹)
            <input
              name="requiredDepositInr"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={requiredInr}
              onChange={(e) => setRequiredInr(e.target.value)}
              className={posInputClass}
            />
          </label>
          <label className="block text-xs text-apg-silver">
            Paid amount (₹)
            <input
              name="paidAmountInr"
              type="number"
              min="0"
              step="0.01"
              required
              value={paidInr}
              onChange={(e) => setPaidInr(e.target.value)}
              className={posInputClass}
            />
          </label>
          <label className="block text-xs text-apg-silver">
            Payment method
            <select name="paymentMethod" defaultValue="cash" className={posInputClass}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block text-xs text-apg-silver">
            Reference (optional)
            <input name="reference" className={posInputClass} placeholder="UPI ref, receipt #" />
          </label>
        </div>
        <label className="block text-xs text-apg-silver">
          Notes (optional)
          <textarea name="notes" rows={2} className={posInputClass} />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-violet-600 py-3.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save deposit'}
        </button>
      </form>

      <p className="text-xs text-apg-muted">
        Need to refund or deduct? Use{' '}
        <Link href={`/admin/refunds?booking=${context.bookingId}`} className="text-[#FF5A1F] hover:underline">
          Refund of Deposit
        </Link>
        .
      </p>
    </div>
  );
}

export function DepositExpressWorkspace({
  initialBookingId,
  initialCustomerId,
  initialContext = null,
  initialLoadError = null,
}: {
  initialBookingId?: string | null;
  initialCustomerId?: string | null;
  initialContext?: DepositExpressContext | null;
  initialLoadError?: string | null;
}) {
  const bootstrapped = useRef(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RefundConsoleBookingRow[]>([]);
  const [bookingPickerRows, setBookingPickerRows] = useState<RefundConsoleBookingRow[] | null>(null);
  const [pickerLabel, setPickerLabel] = useState('');
  const [searching, startSearch] = useTransition();
  const [loading, startLoad] = useTransition();
  const [context, setContext] = useState<DepositExpressContext | null>(initialContext);
  const [loadError, setLoadError] = useState<string | null>(initialLoadError);

  const openBooking = useCallback(
    (bookingId: string) => {
      setLoadError(null);
      setBookingPickerRows(null);
      startLoad(async () => {
        const res = await loadDepositExpressContextAction(bookingId);
        if (!res.ok) {
          setLoadError(res.error);
          setContext(null);
          return;
        }
        setContext(res.context);
        window.history.replaceState(
          null,
          '',
          `/admin/deposit-express?booking=${encodeURIComponent(bookingId)}`,
        );
      });
    },
    [],
  );

  const loadCustomerBookings = useCallback(
    (customerId: string) => {
      setLoadError(null);
      startLoad(async () => {
        const res = await listDepositExpressBookingsAction(customerId);
        if (!res.ok) {
          setLoadError(res.error);
          return;
        }
        if (res.rows.length === 0) {
          setLoadError('No bookings found for this resident.');
          return;
        }
        if (res.rows.length === 1) {
          openBooking(res.rows[0]!.bookingId);
          return;
        }
        setPickerLabel(res.rows[0]?.customerName ?? 'Resident');
        setBookingPickerRows(res.rows);
        window.history.replaceState(
          null,
          '',
          `/admin/deposit-express?customer=${encodeURIComponent(customerId)}`,
        );
      });
    },
    [openBooking],
  );

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    if (initialContext) return;
    if (initialBookingId) openBooking(initialBookingId);
    else if (initialCustomerId) loadCustomerBookings(initialCustomerId);
  }, [initialBookingId, initialCustomerId, initialContext, loadCustomerBookings, openBooking]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      startSearch(async () => {
        const res = await searchDepositExpressAction(trimmed);
        if (res.ok) setSearchResults(res.rows);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  function handleChangeResident() {
    setContext(null);
    setBookingPickerRows(null);
    setLoadError(null);
    setQuery('');
    window.history.replaceState(null, '', '/admin/deposit-express');
  }

  return (
    <div className="-mx-3 flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0B0F14] sm:-mx-4 lg:-mx-8">
      <header className="shrink-0 border-b border-white/10 bg-[#0B0F14]/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-xl font-semibold text-white sm:text-2xl">Deposit Express</h1>
          <p className="text-sm text-apg-silver">Search resident → select booking → collect security deposit only</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        {loadError ? (
          <div className="mx-auto mb-4 max-w-4xl rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {loadError}
          </div>
        ) : null}

        {loading && !context && !bookingPickerRows ? (
          <p className="text-center text-sm text-apg-silver">Loading deposit workspace…</p>
        ) : context ? (
          <DepositWorkspace
            context={context}
            onChangeResident={handleChangeResident}
            onSuccess={() => openBooking(context.bookingId)}
          />
        ) : bookingPickerRows ? (
          <BookingPicker
            rows={bookingPickerRows}
            residentLabel={pickerLabel}
            onSelect={(row) => openBooking(row.bookingId)}
            onBack={handleChangeResident}
          />
        ) : (
          <div className="mx-auto w-full max-w-xl space-y-4 py-8">
            <label className="block text-sm font-medium text-apg-silver">
              Search by name, phone, or booking code
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Start typing…"
                className="mt-3 w-full rounded-2xl border border-white/15 bg-[#0d1118]/90 px-5 py-4 text-lg text-white placeholder:text-apg-muted focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
                autoFocus
              />
            </label>
            {searching ? <p className="text-sm text-apg-silver">Searching…</p> : null}
            {searchResults.length > 0 ? (
              <ul className="overflow-hidden rounded-2xl border border-white/10 bg-[#12161C]/80">
                {searchResults.map((row) => (
                  <li key={row.bookingId}>
                    <button
                      type="button"
                      onClick={() => openBooking(row.bookingId)}
                      className="flex w-full flex-col gap-1 border-b border-white/5 px-5 py-4 text-left transition hover:bg-white/[0.04] last:border-0"
                    >
                      <span className="font-semibold text-white">{row.customerName}</span>
                      <span className="text-sm text-apg-silver">
                        {row.bookingCode} · Wallet {paiseToInr(row.wallet.remainingDepositPaise)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : query.trim().length >= 2 && !searching ? (
              <p className="text-sm text-apg-silver">No residents found.</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
