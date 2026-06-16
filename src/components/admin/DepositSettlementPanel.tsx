'use client';

import { useMemo, useState } from 'react';
import { useActionState } from 'react';
import {
  processDepositSettlementAction,
  type DepositSettlementState,
} from '@/app/(admin)/admin/deposits/[bookingId]/settlementActions';
import { computeRefundDeductions } from '@/src/lib/refundDeductions';
import { paiseToInr } from '@/src/lib/format';

const idle: DepositSettlementState = { status: 'idle' };

export function DepositSettlementPanel({
  bookingId,
  customerId,
  customerName,
  customerPhone,
  depositHeldPaise,
  depositPaidPaise,
  depositRefundablePaise,
}: {
  bookingId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  depositHeldPaise: number;
  depositPaidPaise: number;
  depositRefundablePaise: number;
}) {
  const [state, action, pending] = useActionState(processDepositSettlementAction, idle);
  const [elecRate, setElecRate] = useState('12');
  const [elecUnits, setElecUnits] = useState('');
  const [damage, setDamage] = useState('');
  const [penalty, setPenalty] = useState('');
  const [other, setOther] = useState('');
  const [otherLabel, setOtherLabel] = useState('');

  const held = depositRefundablePaise > 0 ? depositRefundablePaise : depositHeldPaise;

  const preview = useMemo(
    () =>
      computeRefundDeductions(held, {
        electricityUnitCostPaise: Math.round(parseFloat(elecRate || '0') * 100) || 0,
        electricityUnits: parseInt(elecUnits, 10) || 0,
        damageChargePaise: Math.round(parseFloat(damage || '0') * 100) || 0,
        penaltyChargePaise: Math.round(parseFloat(penalty || '0') * 100) || 0,
        customChargePaise: Math.round(parseFloat(other || '0') * 100) || 0,
        customChargeLabel: otherLabel || undefined,
      }),
    [held, elecRate, elecUnits, damage, penalty, other, otherLabel],
  );

  return (
    <section className="rounded-2xl border border-[#FF5A1F]/25 bg-[#1A1F27] p-5">
      <h2 className="text-sm font-semibold text-white">Deposit settlement</h2>
      <p className="mt-1 text-xs text-apg-silver">
        {customerName} · {customerPhone}
      </p>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-apg-silver">Deposit held</dt>
          <dd className="font-semibold text-white">{paiseToInr(depositHeldPaise)}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Deposit paid</dt>
          <dd className="font-semibold text-emerald-300">{paiseToInr(depositPaidPaise)}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Refundable</dt>
          <dd className="font-semibold text-sky-300">{paiseToInr(depositRefundablePaise)}</dd>
        </div>
      </dl>

      <form action={action} className="mt-4 space-y-4 rounded-xl border border-white/10 bg-[#12161C] p-4">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="electricityUnitCostInr" value={elecRate} />
        <input type="hidden" name="electricityUnits" value={elecUnits} />
        <input type="hidden" name="damageInr" value={damage} />
        <input type="hidden" name="penaltyInr" value={penalty} />
        <input type="hidden" name="otherInr" value={other} />
        <input type="hidden" name="otherLabel" value={otherLabel} />

        <p className="text-xs font-semibold uppercase tracking-wide text-[#FF5A1F]">Adjustments</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-apg-silver">
            Electricity rate (₹/unit)
            <input
              type="number"
              step="0.01"
              value={elecRate}
              onChange={(e) => setElecRate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-apg-silver">
            Electricity units
            <input
              type="number"
              min="0"
              value={elecUnits}
              onChange={(e) => setElecUnits(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-apg-silver">
            Damage (₹)
            <input
              type="number"
              min="0"
              step="0.01"
              value={damage}
              onChange={(e) => setDamage(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-apg-silver">
            Penalty (₹)
            <input
              type="number"
              min="0"
              step="0.01"
              value={penalty}
              onChange={(e) => setPenalty(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-apg-silver">
            Other charge (₹)
            <input
              type="number"
              min="0"
              step="0.01"
              value={other}
              onChange={(e) => setOther(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-apg-silver">
            Other label
            <input
              type="text"
              value={otherLabel}
              onChange={(e) => setOtherLabel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <div className="rounded-lg border border-white/10 bg-[#0B0F14] p-3 text-sm">
          <p className="font-semibold text-white">Refund calculation</p>
          <ul className="mt-2 space-y-1 text-xs text-apg-silver">
            <li>Deposit held: {paiseToInr(held)}</li>
            {preview.electricityDeductionPaise ? (
              <li>− Electricity: {paiseToInr(preview.electricityDeductionPaise)}</li>
            ) : null}
            {preview.damageChargePaise ? (
              <li>− Damage: {paiseToInr(preview.damageChargePaise)}</li>
            ) : null}
            {preview.penaltyChargePaise ? (
              <li>− Penalty: {paiseToInr(preview.penaltyChargePaise)}</li>
            ) : null}
            {preview.customChargePaise ? (
              <li>
                − {preview.customChargeLabel ?? 'Other'}: {paiseToInr(preview.customChargePaise)}
              </li>
            ) : null}
          </ul>
          <p className="mt-2 border-t border-white/10 pt-2 font-semibold text-emerald-300">
            Final refund: {paiseToInr(preview.finalRefundPaise)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="decision"
            value="approve"
            disabled={pending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Approve refund
          </button>
          <button
            type="submit"
            name="decision"
            value="reject"
            disabled={pending}
            className="rounded-lg border border-rose-400/40 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
          >
            Reject refund
          </button>
        </div>

        {state.status === 'ok' ? (
          <p className="text-xs text-emerald-300">{state.message}</p>
        ) : null}
        {state.status === 'error' ? (
          <p className="text-xs text-rose-300">{state.message}</p>
        ) : null}
      </form>
    </section>
  );
}
