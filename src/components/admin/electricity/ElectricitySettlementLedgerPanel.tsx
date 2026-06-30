'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { recordManualElectricityCreditAction } from '@/app/(admin)/admin/electricity/ledger/actions';
import type { ElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';
import { formatDate, paiseToInr } from '@/src/lib/format';

export function ElectricitySettlementLedgerPanel({
  ledger,
  showManualCreditForm = false,
}: {
  ledger: ElectricitySettlementLedgerView;
  showManualCreditForm?: boolean;
}) {
  return (
    <section className="rounded-3xl bg-[#1A1F27]/90 p-6 ring-1 ring-white/[0.06]">
      <header className="mb-6 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#FF5A1F]">
          Electricity settlement ledger
        </p>
        <h2 className="text-lg font-semibold text-white">
          {ledger.pgName} · Room {ledger.roomNumber} · {formatDate(ledger.billingMonth)}
        </h2>
        <p className="text-xs text-apg-silver">Your single view of who paid what for this room</p>
      </header>

      {ledger.hasReconciliationWarning ? (
        <div className="mb-6 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {ledger.overCollectionPaise > 0
            ? `This room collected ${paiseToInr(ledger.overCollectionPaise)} more than the bill. Fix manual credits or invoices before closing the month.`
            : !ledger.isBalanced
              ? `Bill and resident shares do not match (gap ${paiseToInr(Math.abs(ledger.reconciliationGapPaise))}). Review allocations before sending reminders.`
              : 'This room needs your review before the month can be closed.'}
        </div>
      ) : null}

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <LedgerStat label="Room bill" value={paiseToInr(ledger.totalRoomBillPaise)} />
        <LedgerStat label="Collected so far" value={paiseToInr(ledger.collectedPaise)} />
        <LedgerStat
          label="Still to recover"
          value={paiseToInr(ledger.outstandingPaise)}
          accent
        />
        <LedgerStat
          label="Collection rate"
          value={`${ledger.collectionPercentage}%`}
        />
      </dl>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <LedgerStat
          label="Paid at checkout"
          value={`−${paiseToInr(ledger.checkoutSettlementTotalPaise)}`}
          muted
        />
        <LedgerStat
          label="Cash / UPI / manual"
          value={`−${paiseToInr(ledger.manualCreditsTotalPaise)}`}
          muted
        />
        {ledger.prepaidCreditAppliedPaise > 0 ? (
          <LedgerStat
            label="Prepaid credit used"
            value={`−${paiseToInr(ledger.prepaidCreditAppliedPaise)}`}
            muted
          />
        ) : null}
      </dl>

      {ledger.checkoutSettlementCredits.length > 0 ? (
        <CreditSection title="Paid at move-out (deposit)" rows={ledger.checkoutSettlementCredits} />
      ) : null}

      {ledger.manualCredits.length > 0 ? (
        <CreditSection title="Cash, UPI, or manual payments" rows={ledger.manualCredits} />
      ) : null}

      {ledger.residentAllocations.length > 0 ? (
        <div className="mt-8 border-t border-white/[0.06] pt-6">
          <h3 className="text-xs font-medium uppercase tracking-wider text-apg-silver">
            Residents
          </h3>
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {ledger.residentAllocations.map((row) => (
              <li
                key={`${row.customerId}-${row.invoiceId ?? 'checkout'}`}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-white">{row.customerName}</p>
                  <p className="text-xs text-apg-silver">
                    {row.invoiceNumber ?? 'Checkout settled'}
                    {row.excludedBecauseCheckoutPaid ? ' · excluded (paid at checkout)' : ''}
                    {' · '}
                    {row.status}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-white">{paiseToInr(row.amountPaise)}</p>
                  {row.paidPaise > 0 ? (
                    <p className="text-xs text-emerald-300">paid {paiseToInr(row.paidPaise)}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-apg-silver">
            Allocated total: {paiseToInr(ledger.residentAllocationsTotalPaise)}
            {ledger.roundingRemainderPaise > 0
              ? ` · operator remainder ${paiseToInr(ledger.roundingRemainderPaise)}`
              : ''}
          </p>
        </div>
      ) : null}

      <div
        className={
          'mt-8 rounded-2xl border px-4 py-4 ' +
          (ledger.isBalanced
            ? 'border-emerald-500/30 bg-emerald-500/10'
            : 'border-amber-400/30 bg-amber-500/10')
        }
      >
        <h3 className="text-sm font-semibold text-white">Does it add up?</h3>
        <p className="mt-2 text-sm text-apg-silver">
          Room bill must equal everything collected plus what residents still owe.
        </p>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-apg-silver">Difference</dt>
            <dd className={ledger.isBalanced ? 'text-emerald-200' : 'text-amber-200'}>
              {paiseToInr(ledger.reconciliationGapPaise)}
              {ledger.isBalanced ? ' ✓ All good' : ' — fix before closing month'}
            </dd>
          </div>
          {ledger.overCollectionPaise > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-apg-silver">Over-collected</dt>
              <dd className="text-rose-200">{paiseToInr(ledger.overCollectionPaise)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-apg-silver">Collection</dt>
            <dd className="text-white">
              {ledger.isFullyCollected
                ? 'Fully collected'
                : `${ledger.collectionPercentage}% collected · ${paiseToInr(ledger.outstandingPaise)} left`}
            </dd>
          </div>
        </dl>
      </div>

      {showManualCreditForm ? (
        <ManualCreditForm
          roomId={ledger.roomId}
          billingMonth={ledger.billingMonth}
          allocations={ledger.residentAllocations}
        />
      ) : null}
    </section>
  );
}

function LedgerStat({
  label,
  value,
  muted,
  accent,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.03] px-4 py-3">
      <dt className="text-xs text-apg-silver">{label}</dt>
      <dd
        className={
          'mt-1 text-lg font-semibold ' +
          (accent ? 'text-[#FF5A1F]' : muted ? 'text-white/80' : 'text-white')
        }
      >
        {value}
      </dd>
    </div>
  );
}

function CreditSection({
  title,
  rows,
}: {
  title: string;
  rows: ElectricitySettlementLedgerView['checkoutSettlementCredits'];
}) {
  return (
    <div className="mt-8 border-t border-white/[0.06] pt-6">
      <h3 className="text-xs font-medium uppercase tracking-wider text-apg-silver">{title}</h3>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2.5 text-sm"
          >
            <div>
              <p className="font-medium text-white">{row.customerName}</p>
              {row.note ? <p className="text-xs text-apg-silver">{row.note}</p> : null}
            </div>
            <p className="font-semibold text-white">{paiseToInr(row.amountPaise)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ManualCreditForm({
  roomId,
  billingMonth,
  allocations,
}: {
  roomId: string;
  billingMonth: string;
  allocations: ElectricitySettlementLedgerView['residentAllocations'];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const billable = allocations.filter(
    (a) => a.bookingId && !a.excludedBecauseCheckoutPaid,
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      const formData = new FormData(event.currentTarget);
      startTransition(async () => {
        const result = await recordManualElectricityCreditAction({
          roomId,
          billingMonth,
          residentKey: String(formData.get('residentKey') ?? ''),
          amountInr: Number(formData.get('amountInr')),
          source: String(formData.get('source') ?? 'manual') as 'manual' | 'cash' | 'upi',
          note: String(formData.get('note') ?? ''),
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
      });
    },
    [billingMonth, roomId, router],
  );

  if (billable.length === 0) return null;

  return (
    <form onSubmit={handleSubmit} className="mt-8 border-t border-white/[0.06] pt-6 space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-apg-silver">
        Record manual / offline credit
      </h3>
      <label className="block text-sm">
        <span className="text-apg-silver">Resident</span>
        <select
          name="residentKey"
          required
          className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-white"
        >
          <option value="">— select —</option>
          {billable.map((a) => (
            <option key={a.customerId} value={`${a.customerId}|${a.bookingId}`}>
              {a.customerName}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-apg-silver">Amount (₹)</span>
        <input
          name="amountInr"
          type="number"
          min="0"
          step="0.01"
          required
          className="apg-admin-field mt-1 block w-full max-w-xs rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-white"
        />
      </label>
      <label className="block text-sm">
        <span className="text-apg-silver">Source</span>
        <select
          name="source"
          className="apg-admin-field mt-1 block w-full max-w-xs rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-white"
        >
          <option value="manual">Manual adjustment</option>
          <option value="cash">Cash</option>
          <option value="upi">UPI / offline</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-apg-silver">Note</span>
        <input
          name="note"
          type="text"
          className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-white"
        />
      </label>
      {error ? <p className="text-sm text-rose-200">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? 'Recording…' : 'Record credit'}
      </button>
    </form>
  );
}
