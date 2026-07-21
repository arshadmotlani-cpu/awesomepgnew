'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BookingMoneyBalances } from '@/src/lib/billing/bookingMoneyBalances';
import {
  totalAllocatedPaise,
  unallocatedPaymentPaise,
} from '@/src/lib/billing/bookingMoneyBalances';
import {
  allocationIsFullyAllocated,
  buildAllocationDefaultsFromReviewItem,
} from '@/src/lib/operations/paymentAllocationUx';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { paiseToInr } from '@/src/lib/format';
import { OPS_ORANGE } from '@/src/components/admin/residentOps/residentOpsUi';

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

export type PaymentAllocationSubmit = {
  confirmedReceivedPaise: number;
  rentAllocatedPaise: number;
  depositAllocatedPaise: number;
  electricityAllocatedPaise: number;
  otherAllocatedPaise: number;
  depositDueDate?: string;
  allocationNotes?: string;
};

export function PaymentAllocationDialog({
  open,
  item,
  residentName,
  submittedAmountPaise,
  balances,
  balancesLoading,
  balancesError,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  item: PendingPaymentReviewItem;
  residentName: string;
  submittedAmountPaise: number;
  balances: BookingMoneyBalances | null;
  balancesLoading?: boolean;
  balancesError?: string | null;
  pending?: boolean;
  onClose: () => void;
  onSubmit: (input: PaymentAllocationSubmit) => void;
}) {
  const [confirmedRupees, setConfirmedRupees] = useState(rupeesFromPaise(submittedAmountPaise));
  const [rentRupees, setRentRupees] = useState('0');
  const [depositRupees, setDepositRupees] = useState('0');
  const [electricityRupees, setElectricityRupees] = useState('0');
  const [otherRupees, setOtherRupees] = useState('0');
  const [depositDueDate, setDepositDueDate] = useState('');
  const [allocationNotes, setAllocationNotes] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const defaults = buildAllocationDefaultsFromReviewItem(item, balances);
    setConfirmedRupees(rupeesFromPaise(defaults.confirmedReceivedPaise));
    setRentRupees(rupeesFromPaise(defaults.rentAllocatedPaise));
    setDepositRupees(rupeesFromPaise(defaults.depositAllocatedPaise));
    setElectricityRupees(rupeesFromPaise(defaults.electricityAllocatedPaise));
    setOtherRupees(rupeesFromPaise(defaults.otherAllocatedPaise));
    setAllocationNotes('');
    setLocalError(null);
    const d = new Date();
    d.setDate(d.getDate() + 14);
    setDepositDueDate(d.toISOString().slice(0, 10));
  }, [open, item, balances, submittedAmountPaise]);

  const allocation = useMemo(
    () => ({
      confirmedReceivedPaise: paiseFromRupeesInput(confirmedRupees),
      rentAllocatedPaise: paiseFromRupeesInput(rentRupees),
      depositAllocatedPaise: paiseFromRupeesInput(depositRupees),
      electricityAllocatedPaise: paiseFromRupeesInput(electricityRupees),
      otherAllocatedPaise: paiseFromRupeesInput(otherRupees),
    }),
    [confirmedRupees, rentRupees, depositRupees, electricityRupees, otherRupees],
  );

  const remainingPaise = unallocatedPaymentPaise(allocation);
  const allocatedTotalPaise = totalAllocatedPaise(allocation);
  const canApprove = allocationIsFullyAllocated(allocation);

  const projectedDepositOutstanding = useMemo(() => {
    if (!balances) return 0;
    return Math.max(
      0,
      balances.deposit.requiredPaise -
        balances.deposit.receivedPaise -
        allocation.depositAllocatedPaise,
    );
  }, [allocation.depositAllocatedPaise, balances]);

  if (!open) return null;

  function handleSubmit() {
    setLocalError(null);
    if (allocation.confirmedReceivedPaise <= 0) {
      setLocalError('Resident paid amount must be greater than zero.');
      return;
    }
    if (allocatedTotalPaise > allocation.confirmedReceivedPaise) {
      setLocalError('Allocated total cannot exceed resident paid.');
      return;
    }
    if (remainingPaise > 0) {
      setLocalError(`Allocate the remaining ${paiseToInr(remainingPaise)} before approving.`);
      return;
    }
    if (
      projectedDepositOutstanding > 0 &&
      allocation.depositAllocatedPaise > 0 &&
      !depositDueDate
    ) {
      setLocalError('Pick a deposit balance due date.');
      return;
    }
    onSubmit({
      ...allocation,
      depositDueDate:
        projectedDepositOutstanding > 0 ? depositDueDate : undefined,
      allocationNotes: allocationNotes.trim() || undefined,
    });
  }

  const remainingTone =
    remainingPaise === 0
      ? 'text-emerald-300'
      : remainingPaise < 0
        ? 'text-rose-300'
        : 'text-amber-200';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#1A1F27] p-5 shadow-xl"
        role="dialog"
        aria-labelledby="allocation-dialog-title"
      >
        <h2 id="allocation-dialog-title" className="text-lg font-semibold text-white">
          Allocate payment
        </h2>
        <p className="mt-1 text-sm text-apg-silver">{residentName}</p>

        {balancesLoading ? (
          <p className="mt-4 text-sm text-apg-silver">Loading balances…</p>
        ) : null}
        {balancesError ? (
          <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {balancesError}
          </p>
        ) : null}

        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-white/10 bg-[#121820] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
              Resident paid
            </p>
            <label className="relative mt-2 block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-apg-silver">
                ₹
              </span>
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={confirmedRupees}
                onChange={(e) => setConfirmedRupees(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#0f1318] py-2.5 pl-8 pr-3 text-2xl font-semibold tabular-nums text-emerald-300"
              />
            </label>
          </div>

          <div className="space-y-3 rounded-xl border border-white/10 bg-[#121820] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
              Allocate payment
            </p>
            <AllocationField label="Rent" value={rentRupees} onChange={setRentRupees} />
            <AllocationField label="Deposit" value={depositRupees} onChange={setDepositRupees} />
            <AllocationField
              label="Electricity"
              value={electricityRupees}
              onChange={setElectricityRupees}
            />
            <AllocationField label="Other" value={otherRupees} onChange={setOtherRupees} />

            <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-sm">
              <span className="font-medium text-white">Remaining</span>
              <span className={`text-base font-semibold tabular-nums ${remainingTone}`}>
                {paiseToInr(remainingPaise)}
              </span>
            </div>
          </div>

          {projectedDepositOutstanding > 0 && allocation.depositAllocatedPaise > 0 ? (
            <label className="block text-xs text-apg-silver">
              Deposit balance due date
              <input
                type="date"
                value={depositDueDate}
                onChange={(e) => setDepositDueDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1318] px-3 py-2 text-sm text-white"
              />
            </label>
          ) : null}

          <label className="block text-xs text-apg-silver">
            Notes (internal, optional)
            <textarea
              value={allocationNotes}
              onChange={(e) => setAllocationNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1318] px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        {localError ? (
          <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {localError}
          </p>
        ) : null}

        {!canApprove && !localError ? (
          <p className="mt-4 text-xs text-apg-silver">
            Allocate every rupee before approving. Remaining must be {paiseToInr(0)}.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || balancesLoading || Boolean(balancesError) || !canApprove}
            onClick={handleSubmit}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            style={{ backgroundColor: OPS_ORANGE }}
          >
            {pending ? 'Approving…' : 'Approve'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded-lg border border-white/10 px-5 py-2.5 text-sm font-medium text-apg-silver hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
