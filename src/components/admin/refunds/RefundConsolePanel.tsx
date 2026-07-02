'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import {
  DEDUCTION_CATEGORY_LABELS,
  ledgerEntryKindLabel,
  type DeductionCategory,
} from '@/src/lib/financial/deductionCategories';
import { paiseToInr, formatDateTime } from '@/src/lib/format';
import type { DepositLedgerEntry } from '@/src/db/schema';
import {
  deductDepositAction,
  initialRefundActionState,
  payRefundAction,
  transferDepositAction,
  type RefundActionState,
} from '@/app/(admin)/admin/refunds/actions';
import type { RefundConsoleBookingRow } from '@/src/services/refundConsole';

function WalletGrid({ wallet }: { wallet: RefundConsoleBookingRow['wallet'] }) {
  const cells = [
    ['Deposit paid', wallet.depositPaidPaise],
    ['Deposit used', wallet.depositUsedPaise],
    ['Deposit transferred', wallet.depositTransferredPaise],
    ['Electricity deduction', wallet.electricityDeductionPaise],
    ['Policy deduction', wallet.policyDeductionPaise],
    ['Other deductions', wallet.otherDeductionsPaise],
    ['Refund paid', wallet.refundPaidPaise],
    ['Remaining deposit', wallet.remainingDepositPaise],
  ] as const;

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cells.map(([label, paise]) => (
        <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <dt className="text-[10px] uppercase tracking-wide text-apg-silver">{label}</dt>
          <dd className="mt-1 text-sm font-semibold text-white">{paiseToInr(paise)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ActionMessage({ state }: { state: RefundActionState }) {
  if (state.status === 'idle') return null;
  const cls =
    state.status === 'ok'
      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
      : 'border-red-400/30 bg-red-500/10 text-red-100';
  return (
    <p className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>
      {state.status === 'ok' ? state.message : state.message}
    </p>
  );
}

function RefundForm({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState(payRefundAction.bind(null, bookingId), initialRefundActionState);
  return (
    <form action={action} className="space-y-3 rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <h3 className="text-sm font-semibold text-white">Pay refund</h3>
      <ActionMessage state={state} />
      <label className="block text-xs text-apg-silver">
        Amount (₹)
        <input name="amountInr" type="number" min="0" step="0.01" required className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" />
      </label>
      <label className="block text-xs text-apg-silver">
        Note
        <input name="note" required className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" />
      </label>
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-apg-orange py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? 'Saving…' : 'Pay refund'}
      </button>
    </form>
  );
}

function DeductForm({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState(deductDepositAction.bind(null, bookingId), initialRefundActionState);
  return (
    <form action={action} className="space-y-3 rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <h3 className="text-sm font-semibold text-white">Deduct deposit</h3>
      <ActionMessage state={state} />
      <label className="block text-xs text-apg-silver">
        Category
        <select name="category" required className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white">
          {(Object.keys(DEDUCTION_CATEGORY_LABELS) as DeductionCategory[]).map((key) => (
            <option key={key} value={key}>
              {DEDUCTION_CATEGORY_LABELS[key]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-apg-silver">
        Amount (₹)
        <input name="amountInr" type="number" min="0" step="0.01" required className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" />
      </label>
      <label className="block text-xs text-apg-silver">
        Note
        <input name="note" required className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" />
      </label>
      <button type="submit" disabled={pending} className="w-full rounded-lg border border-white/15 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? 'Saving…' : 'Deduct deposit'}
      </button>
    </form>
  );
}

function TransferForm({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState(transferDepositAction.bind(null, bookingId), initialRefundActionState);
  return (
    <form action={action} className="space-y-3 rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <h3 className="text-sm font-semibold text-white">Transfer deposit</h3>
      <ActionMessage state={state} />
      <label className="block text-xs text-apg-silver">
        Target booking id
        <input name="targetBookingId" required className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" />
      </label>
      <label className="block text-xs text-apg-silver">
        Amount (₹)
        <input name="amountInr" type="number" min="0" step="0.01" required className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" />
      </label>
      <button type="submit" disabled={pending} className="w-full rounded-lg border border-white/15 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? 'Saving…' : 'Transfer deposit'}
      </button>
    </form>
  );
}

function LedgerTable({ entries }: { entries: DepositLedgerEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-apg-silver">No ledger entries yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="min-w-full text-sm">
        <thead className="bg-white/[0.03] text-left text-[10px] uppercase tracking-wide text-apg-silver">
          <tr>
            <th className="px-3 py-2">When</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Reason</th>
            <th className="px-3 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="px-3 py-2 text-apg-silver">{formatDateTime(entry.createdAt)}</td>
              <td className="px-3 py-2 text-white">
                {ledgerEntryKindLabel({
                  entryKind: entry.entryKind,
                  deductionCategory: entry.deductionCategory,
                  reason: entry.reason,
                })}
              </td>
              <td className="px-3 py-2 text-apg-silver">{entry.reason}</td>
              <td className="px-3 py-2 text-right font-medium text-white">{paiseToInr(entry.amountPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RefundConsolePanel({
  searchResults,
  detail,
  query,
}: {
  query: string;
  searchResults: RefundConsoleBookingRow[];
  detail: (RefundConsoleBookingRow & { ledger: DepositLedgerEntry[] }) | null;
}) {
  const [showLedger, setShowLedger] = useState(true);

  return (
    <div className="space-y-6">
      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search booking code, phone, or name"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-2.5 text-sm text-white"
        />
        <button type="submit" className="rounded-xl bg-apg-orange px-4 py-2.5 text-sm font-semibold text-white">
          Search
        </button>
      </form>

      {searchResults.length > 0 && !detail ? (
        <ul className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#1A1F27]">
          {searchResults.map((row) => (
            <li key={row.bookingId}>
              <Link
                href={`/admin/refunds?booking=${row.bookingId}`}
                className="flex flex-col gap-1 px-4 py-3 hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-white">{row.customerName}</p>
                  <p className="text-xs text-apg-silver">
                    {row.bookingCode}
                    {row.bedLabel ? ` · ${row.bedLabel}` : ''}
                  </p>
                </div>
                <p className="text-sm font-semibold text-emerald-300">
                  Remaining: {paiseToInr(row.wallet.remainingDepositPaise)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {detail ? (
        <section className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">{detail.customerName}</h2>
              <p className="text-sm text-apg-silver">
                {detail.bookingCode}
                {detail.pgName ? ` · ${detail.pgName}` : ''}
                {detail.bedLabel ? ` · ${detail.bedLabel}` : ''}
              </p>
            </div>
            <Link href="/admin/refunds" className="text-sm text-apg-silver hover:text-white">
              ← Back to search
            </Link>
          </div>

          <WalletGrid wallet={detail.wallet} />

          <div className="grid gap-4 lg:grid-cols-3">
            <RefundForm bookingId={detail.bookingId} />
            <DeductForm bookingId={detail.bookingId} />
            <TransferForm bookingId={detail.bookingId} />
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowLedger((v) => !v)}
              className="mb-3 text-sm font-semibold text-white"
            >
              {showLedger ? 'Hide ledger' : 'View ledger'}
            </button>
            {showLedger ? <LedgerTable entries={detail.ledger} /> : null}
          </div>
        </section>
      ) : query.length === 0 && !detail ? (
        <p className="rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-8 text-center text-sm text-apg-silver">
          Search for a resident to pay refunds, transfer deposits, or record deductions.
        </p>
      ) : null}
    </div>
  );
}
