'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateCheckoutElectricityAction,
  type CheckoutSettlementActionState,
} from '@/app/(admin)/admin/checkout-settlements/actions';
import { calculateCheckoutElectricity } from '@/src/lib/checkout/electricitySettlement';
import { paiseToInr } from '@/src/lib/format';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

const idle: CheckoutSettlementActionState = { status: 'idle' };

export function CheckoutSettlementElectricitySection({
  detail,
  editable,
}: {
  detail: CheckoutSettlementDetail;
  editable: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateCheckoutElectricityAction, idle);

  const defaultRateInr =
    detail.electricityUnitRatePaise != null
      ? (detail.electricityUnitRatePaise / 100).toFixed(2)
      : '16';

  const [previousReading, setPreviousReading] = useState(
    detail.electricityPreviousReading ?? '',
  );
  const [currentReading, setCurrentReading] = useState(
    detail.electricityCurrentReading ?? '',
  );
  const [ratePerUnitInr, setRatePerUnitInr] = useState(defaultRateInr);
  const [deductFromDeposit, setDeductFromDeposit] = useState(
    detail.electricityDeductFromDeposit !== false,
  );

  useEffect(() => {
    if (state.status === 'ok') router.refresh();
  }, [state.status, router]);

  const live = useMemo(() => {
    const prev = Number(previousReading);
    const cur = Number(currentReading);
    const rate = Number(ratePerUnitInr);
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || !Number.isFinite(rate) || rate <= 0) {
      return null;
    }
    return calculateCheckoutElectricity({
      previousReading: prev,
      currentReading: cur,
      ratePerUnitPaise: Math.round(rate * 100),
      roomOccupants: detail.roomMonthlyOccupants,
    });
  }, [previousReading, currentReading, ratePerUnitInr, detail.roomMonthlyOccupants]);

  return (
    <div className="space-y-4">
      {detail.electricityMeterPhotoUrl ? (
        <a
          href={detail.electricityMeterPhotoUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-[#FF5A1F] hover:underline"
        >
          View resident meter photo
        </a>
      ) : detail.electricityUseAverage ? (
        <p className="text-sm text-apg-silver">Resident chose average billing fallback.</p>
      ) : (
        <p className="text-sm text-apg-silver">
          Room sharing: {detail.roomMonthlyOccupants} monthly resident
          {detail.roomMonthlyOccupants === 1 ? '' : 's'} in this room today.
        </p>
      )}

      {editable ? (
        <form action={action} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="settlementId" value={detail.id} />
          <label className="text-sm">
            <span className="text-apg-silver">Previous meter reading</span>
            <input
              name="previousReading"
              type="number"
              min="0"
              step="1"
              required
              value={previousReading}
              onChange={(e) => setPreviousReading(e.target.value)}
              className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-white"
            />
          </label>
          <label className="text-sm">
            <span className="text-apg-silver">Current meter reading</span>
            <input
              name="currentReading"
              type="number"
              min="0"
              step="1"
              required
              value={currentReading}
              onChange={(e) => setCurrentReading(e.target.value)}
              className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-white"
            />
          </label>
          <label className="text-sm">
            <span className="text-apg-silver">Rate per unit (₹)</span>
            <input
              name="ratePerUnitInr"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={ratePerUnitInr}
              onChange={(e) => setRatePerUnitInr(e.target.value)}
              className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-white"
            />
          </label>
          <label className="flex items-center gap-2 self-end text-sm text-white">
            <input
              type="checkbox"
              name="deductFromDeposit"
              checked={deductFromDeposit}
              onChange={(e) => setDeductFromDeposit(e.target.checked)}
              className="rounded border-white/20"
            />
            Deduct electricity from deposit
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/5 disabled:opacity-60"
            >
              {pending ? 'Calculating…' : 'Save electricity settlement'}
            </button>
            {state.status === 'error' ? (
              <p className="mt-2 text-xs text-rose-300">{state.message}</p>
            ) : null}
            {state.status === 'ok' ? (
              <p className="mt-2 text-xs text-emerald-300">{state.message}</p>
            ) : null}
          </div>
        </form>
      ) : null}

      {(live?.ok || detail.electricityUnits) && (
        <dl className="grid gap-2 rounded-xl border border-white/10 bg-[#12161C] p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-apg-silver">Units consumed</dt>
            <dd className="text-white">
              {live?.ok ? live.calc.unitsConsumed : detail.electricityUnits}
            </dd>
          </div>
          <div>
            <dt className="text-apg-silver">Total room bill</dt>
            <dd className="text-white">
              {live?.ok
                ? paiseToInr(live.calc.totalBillPaise)
                : paiseToInr(detail.electricityTotalBillPaise)}
            </dd>
          </div>
          <div>
            <dt className="text-apg-silver">Sharing (occupants)</dt>
            <dd className="text-white">
              {live?.ok ? live.calc.roomOccupants : detail.electricityOccupants ?? detail.roomMonthlyOccupants}
            </dd>
          </div>
          <div>
            <dt className="text-apg-silver">This resident&apos;s share</dt>
            <dd className="font-semibold text-white">
              {live?.ok
                ? paiseToInr(live.calc.sharePaise)
                : paiseToInr(detail.electricitySharePaise)}
            </dd>
          </div>
          {!deductFromDeposit && (
            <div className="sm:col-span-2 text-xs text-amber-200">
              Electricity will not be deducted from deposit refund.
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
