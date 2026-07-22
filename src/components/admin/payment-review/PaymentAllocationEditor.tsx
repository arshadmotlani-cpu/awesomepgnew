'use client';

import { useEffect, useMemo, useState } from 'react';
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
  defaultProofAmountPaise,
  onChange,
  onValidityChange,
}: {
  item: PendingPaymentReviewItem;
  defaultProofAmountPaise: number;
  onChange: (input: PaymentAllocationSubmit) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [amountReceivedRupees, setAmountReceivedRupees] = useState('0');
  const [rentRupees, setRentRupees] = useState('0');
  const [depositRupees, setDepositRupees] = useState('0');
  const [electricityRupees, setElectricityRupees] = useState('0');
  const [otherRupees, setOtherRupees] = useState('0');
  const [allocationNotes, setAllocationNotes] = useState('');

  useEffect(() => {
    const defaults = buildAllocationDefaultsFromReviewItem({
      ...item,
      amountPaise: defaultProofAmountPaise,
      submittedAmountPaise: defaultProofAmountPaise,
      receivedPaise: defaultProofAmountPaise,
    });
    setAmountReceivedRupees(rupeesFromPaise(defaults.confirmedReceivedPaise));
    setRentRupees(rupeesFromPaise(defaults.rentAllocatedPaise));
    setDepositRupees(rupeesFromPaise(defaults.depositAllocatedPaise));
    setElectricityRupees(rupeesFromPaise(defaults.electricityAllocatedPaise));
    setOtherRupees(rupeesFromPaise(defaults.otherAllocatedPaise));
  }, [item, defaultProofAmountPaise]);

  const allocation = useMemo(
    () => ({
      confirmedReceivedPaise: paiseFromRupeesInput(amountReceivedRupees),
      rentAllocatedPaise: paiseFromRupeesInput(rentRupees),
      depositAllocatedPaise: paiseFromRupeesInput(depositRupees),
      electricityAllocatedPaise: paiseFromRupeesInput(electricityRupees),
      otherAllocatedPaise: paiseFromRupeesInput(otherRupees),
    }),
    [amountReceivedRupees, rentRupees, depositRupees, electricityRupees, otherRupees],
  );

  const remainingPaise = unallocatedPaymentPaise(allocation);
  const allocatedTotalPaise = totalAllocatedPaise(allocation);

  const valid =
    allocation.confirmedReceivedPaise > 0 &&
    allocatedTotalPaise <= allocation.confirmedReceivedPaise &&
    remainingPaise === 0;

  useEffect(() => {
    onChange({
      ...allocation,
      allocationNotes: allocationNotes.trim() || undefined,
    });
    onValidityChange?.(valid);
  }, [allocation, allocationNotes, onChange, onValidityChange, valid]);

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
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <h2 className="text-base font-semibold text-white">Edit allocation</h2>
          <p className="mt-1 text-xs text-apg-silver">
            {expanded
              ? 'Assign this payment only — not lifetime account totals.'
              : `Default: Rent ${paiseToInr(paiseFromRupeesInput(rentRupees))} · Deposit ${paiseToInr(paiseFromRupeesInput(depositRupees))}`}
          </p>
        </div>
        <span className="text-sm text-apg-orange">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded ? (
        <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
          <AllocationField
            label="Amount received (this proof)"
            value={amountReceivedRupees}
            onChange={setAmountReceivedRupees}
          />
          {showRent ? (
            <AllocationField label="Rent received" value={rentRupees} onChange={setRentRupees} />
          ) : null}
          {showDeposit ? (
            <AllocationField label="Deposit received" value={depositRupees} onChange={setDepositRupees} />
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

          <label className="block text-xs text-apg-silver">
            Allocation notes (internal)
            <textarea
              value={allocationNotes}
              onChange={(e) => setAllocationNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1318] px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
