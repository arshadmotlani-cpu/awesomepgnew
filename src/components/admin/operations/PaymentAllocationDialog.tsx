'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BookingMoneyBalances } from '@/src/lib/billing/bookingMoneyBalances';
import { unallocatedPaymentPaise } from '@/src/lib/billing/bookingMoneyBalances';
import type { OverpaymentDisposition } from '@/src/lib/operations/paymentReviewTypes';
import { paiseToInr } from '@/src/lib/format';
import { OPS_ORANGE } from '@/src/components/admin/residentOps/residentOpsUi';

const OVERPAYMENT_OPTIONS: Array<{ value: OverpaymentDisposition; label: string }> = [
  { value: 'wallet_credit', label: 'Credit to wallet' },
  { value: 'future_adjustment', label: 'Future adjustment' },
  { value: 'refund_later', label: 'Refund later' },
];

function rupeesFromPaise(paise: number): string {
  return (paise / 100).toFixed(0);
}

function paiseFromRupeesInput(value: string): number {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function BalancePreview({
  label,
  balances,
}: {
  label: string;
  balances: BookingMoneyBalances['rent'];
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#121820]/80 p-3 text-xs">
      <p className="font-semibold uppercase tracking-wide text-apg-silver">{label}</p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-apg-silver">Required</dt>
          <dd className="mt-0.5 font-medium text-white">{paiseToInr(balances.requiredPaise)}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Received</dt>
          <dd className="mt-0.5 font-medium text-white">{paiseToInr(balances.receivedPaise)}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Outstanding</dt>
          <dd className="mt-0.5 font-medium text-emerald-300">
            {paiseToInr(balances.outstandingPaise)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export type PaymentAllocationSubmit = {
  confirmedReceivedPaise: number;
  rentAllocatedPaise: number;
  depositAllocatedPaise: number;
  depositDueDate?: string;
  allocationNotes?: string;
  overpaymentDisposition?: OverpaymentDisposition;
};

export function PaymentAllocationDialog({
  open,
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
  const [depositDueDate, setDepositDueDate] = useState('');
  const [allocationNotes, setAllocationNotes] = useState('');
  const [overpayDisposition, setOverpayDisposition] =
    useState<OverpaymentDisposition>('wallet_credit');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmedRupees(rupeesFromPaise(submittedAmountPaise));
    setRentRupees('0');
    setDepositRupees('0');
    setAllocationNotes('');
    setLocalError(null);
    const d = new Date();
    d.setDate(d.getDate() + 14);
    setDepositDueDate(d.toISOString().slice(0, 10));
  }, [open, submittedAmountPaise]);

  const allocation = useMemo(
    () => ({
      confirmedReceivedPaise: paiseFromRupeesInput(confirmedRupees),
      rentAllocatedPaise: paiseFromRupeesInput(rentRupees),
      depositAllocatedPaise: paiseFromRupeesInput(depositRupees),
    }),
    [confirmedRupees, rentRupees, depositRupees],
  );

  const unallocatedPaise = unallocatedPaymentPaise(allocation);

  const projected = useMemo(() => {
    if (!balances) return null;
    return {
      rent: {
        requiredPaise: balances.rent.requiredPaise,
        receivedPaise: balances.rent.receivedPaise + allocation.rentAllocatedPaise,
        outstandingPaise: Math.max(
          0,
          balances.rent.requiredPaise -
            balances.rent.receivedPaise -
            allocation.rentAllocatedPaise,
        ),
      },
      deposit: {
        requiredPaise: balances.deposit.requiredPaise,
        receivedPaise: balances.deposit.receivedPaise + allocation.depositAllocatedPaise,
        outstandingPaise: Math.max(
          0,
          balances.deposit.requiredPaise -
            balances.deposit.receivedPaise -
            allocation.depositAllocatedPaise,
        ),
      },
    };
  }, [allocation, balances]);

  if (!open) return null;

  function handleSubmit() {
    setLocalError(null);
    if (allocation.confirmedReceivedPaise <= 0) {
      setLocalError('Confirmed received amount must be greater than zero.');
      return;
    }
    const totalAllocated =
      allocation.rentAllocatedPaise + allocation.depositAllocatedPaise;
    if (totalAllocated > allocation.confirmedReceivedPaise) {
      setLocalError('Rent plus deposit cannot exceed confirmed received.');
      return;
    }
    if (balances && allocation.depositAllocatedPaise > balances.deposit.outstandingPaise) {
      setLocalError(
        `Deposit allocation exceeds outstanding (₹${rupeesFromPaise(balances.deposit.outstandingPaise)}).`,
      );
      return;
    }
    if (unallocatedPaise > 0 && !overpayDisposition) {
      setLocalError('Choose how to handle unallocated amount.');
      return;
    }
    if (
      projected &&
      projected.deposit.outstandingPaise > 0 &&
      allocation.depositAllocatedPaise > 0 &&
      !depositDueDate
    ) {
      setLocalError('Pick a deposit balance due date.');
      return;
    }
    onSubmit({
      ...allocation,
      depositDueDate:
        projected && projected.deposit.outstandingPaise > 0 ? depositDueDate : undefined,
      allocationNotes: allocationNotes.trim() || undefined,
      overpaymentDisposition: unallocatedPaise > 0 ? overpayDisposition : undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#1A1F27] p-5 shadow-xl"
        role="dialog"
        aria-labelledby="allocation-dialog-title"
      >
        <h2 id="allocation-dialog-title" className="text-lg font-semibold text-white">
          Approve with allocation
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

        <div className="mt-4 space-y-3">
          <label className="block text-xs text-apg-silver">
            Submitted amount (resident)
            <input
              readOnly
              value={paiseToInr(submittedAmountPaise)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1318]/80 px-3 py-2 text-sm text-apg-silver"
            />
          </label>
          <label className="block text-xs text-apg-silver">
            Confirmed received (₹)
            <input
              type="number"
              min={0}
              step={1}
              value={confirmedRupees}
              onChange={(e) => setConfirmedRupees(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1318] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-apg-silver">
            Rent allocated (₹)
            <input
              type="number"
              min={0}
              step={1}
              value={rentRupees}
              onChange={(e) => setRentRupees(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1318] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-apg-silver">
            Deposit allocated (₹)
            <input
              type="number"
              min={0}
              step={1}
              value={depositRupees}
              onChange={(e) => setDepositRupees(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1318] px-3 py-2 text-sm text-white"
            />
          </label>
          {unallocatedPaise > 0 ? (
            <p className="text-xs text-amber-200">
              Unallocated: {paiseToInr(unallocatedPaise)} — choose disposition below.
            </p>
          ) : null}
          {projected && projected.deposit.outstandingPaise > 0 ? (
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
          {unallocatedPaise > 0 ? (
            <label className="block text-xs text-apg-silver">
              Unallocated disposition
              <select
                value={overpayDisposition}
                onChange={(e) => setOverpayDisposition(e.target.value as OverpaymentDisposition)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1318] px-3 py-2 text-sm text-white"
              >
                {OVERPAYMENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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

        {balances && projected ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
              After allocation
            </p>
            <BalancePreview label="Rent" balances={projected.rent} />
            <BalancePreview label="Deposit" balances={projected.deposit} />
          </div>
        ) : null}

        {localError ? (
          <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {localError}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={handleSubmit}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            style={{ backgroundColor: OPS_ORANGE }}
          >
            {pending ? 'Approving…' : 'Approve with allocation'}
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
