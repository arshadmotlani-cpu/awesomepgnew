'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BookingMoneyBalances } from '@/src/lib/billing/bookingMoneyBalances';
import {
  totalAllocatedPaise,
  unallocatedPaymentPaise,
} from '@/src/lib/billing/bookingMoneyBalances';
import { buildAllocationDefaultsFromReviewItem } from '@/src/lib/operations/paymentAllocationUx';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { paiseToInr } from '@/src/lib/format';
import type { PaymentAllocationSubmit } from '@/src/components/admin/operations/PaymentAllocationDialog';

function rupeesFromPaise(paise: number): string {
  return (paise / 100).toFixed(0);
}

function paiseFromRupeesInput(value: string): number {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function AllocationField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs text-apg-silver">
      {label}
      <div className="relative mt-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-apg-silver">
          ₹
        </span>
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-[#0f1318] py-2 pl-7 pr-3 text-sm tabular-nums text-white"
        />
      </div>
    </label>
  );
}

export function PaymentAllocationEditor({
  item,
  submittedAmountPaise,
  balances,
  balancesLoading,
  balancesError,
  onChange,
  onValidityChange,
}: {
  item: PendingPaymentReviewItem;
  submittedAmountPaise: number;
  balances: BookingMoneyBalances | null;
  balancesLoading?: boolean;
  balancesError?: string | null;
  onChange: (input: PaymentAllocationSubmit) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [rentRupees, setRentRupees] = useState('0');
  const [depositRupees, setDepositRupees] = useState('0');
  const [electricityRupees, setElectricityRupees] = useState('0');
  const [otherRupees, setOtherRupees] = useState('0');
  const [depositDueDate, setDepositDueDate] = useState('');
  const [allocationNotes, setAllocationNotes] = useState('');

  useEffect(() => {
    const defaults = buildAllocationDefaultsFromReviewItem(item, balances);
    setRentRupees(rupeesFromPaise(defaults.rentAllocatedPaise));
    setDepositRupees(rupeesFromPaise(defaults.depositAllocatedPaise));
    setElectricityRupees(rupeesFromPaise(defaults.electricityAllocatedPaise));
    setOtherRupees(rupeesFromPaise(defaults.otherAllocatedPaise));
    const d = new Date();
    d.setDate(d.getDate() + 14);
    setDepositDueDate(d.toISOString().slice(0, 10));
  }, [item, balances, submittedAmountPaise]);

  const allocation = useMemo(
    () => ({
      confirmedReceivedPaise: submittedAmountPaise,
      rentAllocatedPaise: paiseFromRupeesInput(rentRupees),
      depositAllocatedPaise: paiseFromRupeesInput(depositRupees),
      electricityAllocatedPaise: paiseFromRupeesInput(electricityRupees),
      otherAllocatedPaise: paiseFromRupeesInput(otherRupees),
    }),
    [submittedAmountPaise, rentRupees, depositRupees, electricityRupees, otherRupees],
  );

  const remainingPaise = unallocatedPaymentPaise(allocation);
  const allocatedTotalPaise = totalAllocatedPaise(allocation);

  const projectedDepositOutstanding = useMemo(() => {
    if (!balances) return 0;
    return Math.max(
      0,
      balances.deposit.requiredPaise -
        balances.deposit.receivedPaise -
        allocation.depositAllocatedPaise,
    );
  }, [allocation.depositAllocatedPaise, balances]);

  const valid =
    allocation.confirmedReceivedPaise > 0 &&
    allocatedTotalPaise <= allocation.confirmedReceivedPaise &&
    remainingPaise === 0 &&
    !balancesLoading &&
    !balancesError;

  useEffect(() => {
    onChange({
      ...allocation,
      depositDueDate:
        projectedDepositOutstanding > 0 && allocation.depositAllocatedPaise > 0
          ? depositDueDate
          : undefined,
      allocationNotes: allocationNotes.trim() || undefined,
    });
    onValidityChange?.(valid);
  }, [
    allocation,
    allocationNotes,
    depositDueDate,
    onChange,
    onValidityChange,
    projectedDepositOutstanding,
    valid,
  ]);

  const remainingTone =
    remainingPaise === 0
      ? 'text-emerald-300'
      : remainingPaise < 0
        ? 'text-rose-300'
        : 'text-amber-200';

  const showRent = item.kind === 'qr' || item.kind === 'rent' || item.kind === 'extension';
  const showDeposit = item.kind === 'qr' || item.kind === 'deposit_link';
  const showElectricity = item.kind === 'electricity';

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <h2 className="text-base font-semibold text-white">Allocation</h2>
      <p className="mt-1 text-xs text-apg-silver">
        Assign every rupee before approving. Remaining must be {paiseToInr(0)}.
      </p>

      {balancesLoading ? (
        <p className="mt-4 text-sm text-apg-silver">Loading balances…</p>
      ) : null}
      {balancesError ? (
        <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {balancesError}
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        {showRent ? (
          <AllocationField label="Rent" value={rentRupees} onChange={setRentRupees} />
        ) : null}
        {showDeposit ? (
          <AllocationField label="Deposit" value={depositRupees} onChange={setDepositRupees} />
        ) : null}
        {showElectricity ? (
          <AllocationField
            label="Electricity"
            value={electricityRupees}
            onChange={setElectricityRupees}
          />
        ) : null}
        <AllocationField label="Other" value={otherRupees} onChange={setOtherRupees} />

        <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-sm">
          <span className="font-medium text-white">Remaining</span>
          <span className={`text-base font-semibold tabular-nums ${remainingTone}`}>
            {paiseToInr(remainingPaise)}
          </span>
        </div>
      </div>

      {projectedDepositOutstanding > 0 && allocation.depositAllocatedPaise > 0 ? (
        <label className="mt-4 block text-xs text-apg-silver">
          Deposit balance due date
          <input
            type="date"
            value={depositDueDate}
            onChange={(e) => setDepositDueDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1318] px-3 py-2 text-sm text-white"
          />
        </label>
      ) : null}

      <label className="mt-4 block text-xs text-apg-silver">
        Allocation notes (internal)
        <textarea
          value={allocationNotes}
          onChange={(e) => setAllocationNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1318] px-3 py-2 text-sm text-white"
        />
      </label>
    </div>
  );
}
