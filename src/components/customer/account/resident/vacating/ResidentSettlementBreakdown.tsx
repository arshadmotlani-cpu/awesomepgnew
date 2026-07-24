'use client';

import { ApgCard } from '@/src/components/customer/design-system';
import { SETTLEMENT_BREAKDOWN_PLACEHOLDER } from '@/src/lib/residents/vacatingPresentation';
import { paiseToInr } from '@/src/lib/format';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';

function Line({
  label,
  amountPaise,
  deduct,
  emphasis,
}: {
  label: string;
  amountPaise: number;
  deduct?: boolean;
  emphasis?: boolean;
}) {
  if (!emphasis && amountPaise <= 0 && deduct) return null;
  const value =
    deduct && amountPaise > 0 ? `−${paiseToInr(amountPaise)}` : paiseToInr(amountPaise);

  return (
    <div className={`flex items-center justify-between gap-3 text-sm ${emphasis ? 'pt-2' : ''}`}>
      <span className={emphasis ? 'font-semibold text-zinc-900' : 'text-zinc-600'}>{label}</span>
      <span
        className={`tabular-nums font-semibold ${
          emphasis ? 'text-lg text-emerald-700' : deduct ? 'text-rose-700' : 'text-zinc-900'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function ResidentSettlementBreakdown({
  waterfall = null,
  className = '',
}: {
  waterfall?: CheckoutSettlementWaterfall | null;
  className?: string;
}) {
  const damagePaise = waterfall?.depositBucket.otherPaise ?? 0;

  return (
    <ApgCard tier="account" className={`p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-zinc-900">How was this calculated?</h3>
      {!waterfall ? (
        <p className="mt-2 text-sm text-zinc-600">{SETTLEMENT_BREAKDOWN_PLACEHOLDER}</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-zinc-600">
            Your final refund includes unused rent credit and your remaining deposit after
            deductions.
          </p>
          <div className="mt-4 space-y-2.5 border-t border-zinc-100 pt-4">
            <Line label="Rent Paid" amountPaise={waterfall.rentBucket.paidPaise} />
            <Line label="Rent Used" amountPaise={waterfall.rentBucket.consumedPaise} />
            <Line label="Unused Rent" amountPaise={waterfall.rentBucket.unusedPaise} />
            <Line label="Notice Deduction" amountPaise={waterfall.notice.fullPaise} deduct />
            <Line
              label="Electricity Deduction"
              amountPaise={waterfall.depositBucket.electricityPaise}
              deduct
            />
            {waterfall.depositBucket.tailRentPaise > 0 ? (
              <Line
                label="Rent through vacate date"
                amountPaise={waterfall.depositBucket.tailRentPaise}
                deduct
              />
            ) : null}
            {damagePaise > 0 ? (
              <Line label="Damage Charges" amountPaise={damagePaise} deduct />
            ) : null}
            <Line label="Refundable Deposit" amountPaise={waterfall.depositBucket.refundablePaise} />
            <Line label="Final Refund" amountPaise={waterfall.refund.totalPaise} emphasis />
          </div>
        </>
      )}
    </ApgCard>
  );
}
