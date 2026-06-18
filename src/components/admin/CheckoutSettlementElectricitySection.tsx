'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateCheckoutElectricityAction,
  type CheckoutSettlementActionState,
} from '@/app/(admin)/admin/checkout-settlements/actions';
import {
  calculateAverageBillingElectricity,
  calculateCheckoutElectricity,
  calculateManualElectricityCharge,
  effectiveSharingCount,
  type ElectricityCalculationMethod,
} from '@/src/lib/checkout/electricitySettlementCalc';
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

  const [method, setMethod] = useState<ElectricityCalculationMethod>(
    (detail.electricityCalculationMethod as ElectricityCalculationMethod) ?? 'meter_reading',
  );
  const [meterPhotoMissing, setMeterPhotoMissing] = useState(
    detail.meterPhotoMissing || (!detail.electricityMeterPhotoUrl && !detail.electricityUseAverage),
  );
  const [sharingOverride, setSharingOverride] = useState(detail.electricitySharingOverride);
  const [sharingCountOverride, setSharingCountOverride] = useState(
    String(detail.electricityOccupants ?? detail.roomOccupancy.autoDetectedCount),
  );
  const [previousReading, setPreviousReading] = useState(
    detail.electricityPreviousReading ?? '',
  );
  const [currentReading, setCurrentReading] = useState(
    detail.electricityCurrentReading ?? '',
  );
  const [ratePerUnitInr, setRatePerUnitInr] = useState(
    detail.electricityUnitRatePaise != null
      ? (detail.electricityUnitRatePaise / 100).toFixed(2)
      : '16',
  );
  const [averageBillInr, setAverageBillInr] = useState(
    detail.averageBillPaise != null ? (detail.averageBillPaise / 100).toFixed(2) : '',
  );
  const [manualChargeInr, setManualChargeInr] = useState(
    detail.manualChargePaise != null
      ? (detail.manualChargePaise / 100).toFixed(2)
      : detail.electricitySharePaise > 0
        ? (detail.electricitySharePaise / 100).toFixed(2)
        : '',
  );
  const [deductFromDeposit, setDeductFromDeposit] = useState(
    detail.electricityDeductFromDeposit !== false,
  );

  useEffect(() => {
    if (state.status === 'ok') router.refresh();
  }, [state.status, router]);

  const occupants = useMemo(
    () =>
      effectiveSharingCount({
        autoDetectedCount: detail.roomOccupancy.autoDetectedCount,
        roomCapacity: detail.roomOccupancy.roomCapacity,
        overrideEnabled: sharingOverride,
        overrideCount: Number(sharingCountOverride),
      }),
    [detail.roomOccupancy, sharingOverride, sharingCountOverride],
  );

  const live = useMemo(() => {
    if (method === 'meter_reading') {
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
        roomOccupants: occupants,
      });
    }
    if (method === 'average_billing') {
      const bill = Number(averageBillInr);
      if (!Number.isFinite(bill) || bill <= 0) return null;
      return calculateAverageBillingElectricity({
        averageBillPaise: Math.round(bill * 100),
        roomOccupants: occupants,
        autoDetectedOccupants: detail.roomOccupancy.autoDetectedCount,
      });
    }
    const charge = Number(manualChargeInr);
    if (!Number.isFinite(charge) || charge < 0) return null;
    return calculateManualElectricityCharge({
      manualChargePaise: Math.round(charge * 100),
      roomOccupants: occupants,
      autoDetectedOccupants: detail.roomOccupancy.autoDetectedCount,
    });
  }, [
    method,
    previousReading,
    currentReading,
    ratePerUnitInr,
    averageBillInr,
    manualChargeInr,
    occupants,
    detail.roomOccupancy.autoDetectedCount,
  ]);

  const previewSharePaise = live?.ok ? live.calc.sharePaise : detail.electricitySharePaise;
  const previewTotalBillPaise = live?.ok
    ? live.calc.totalBillPaise
    : detail.electricityTotalBillPaise;
  const refundImpactPaise = deductFromDeposit ? previewSharePaise : 0;

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
      ) : meterPhotoMissing ? (
        <p className="text-sm text-amber-200">Resident did not upload a meter photo.</p>
      ) : (
        <p className="text-sm text-apg-silver">Awaiting resident meter photo or admin settlement.</p>
      )}

      <section className="rounded-xl border border-white/10 bg-[#12161C] p-4 text-sm">
        <h4 className="font-semibold text-white">Sharing detection</h4>
        <p className="mt-1 text-xs text-apg-silver">
          Auto-detected sharing: {detail.roomOccupancy.autoDetectedCount} occupant
          {detail.roomOccupancy.autoDetectedCount === 1 ? '' : 's'}
          {detail.roomOccupancy.isSingleOccupancy ? ' (single room — no split)' : ''}
        </p>
        <p className="mt-1 text-xs text-apg-silver">
          Occupancy source: {detail.roomOccupancy.source}
        </p>
        {detail.roomOccupancy.occupantNames.length > 0 ? (
          <ul className="mt-2 list-inside list-disc text-xs text-white">
            {detail.roomOccupancy.occupantNames.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {editable ? (
        <form action={action} className="space-y-4">
          <input type="hidden" name="settlementId" value={detail.id} />
          <input type="hidden" name="calculationMethod" value={method} />

          <label className="flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox"
              name="meterPhotoMissing"
              checked={meterPhotoMissing}
              onChange={(e) => setMeterPhotoMissing(e.target.checked)}
              className="rounded border-white/20"
            />
            Resident did not upload meter photo
          </label>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-white">Electricity calculation method</legend>
            {(
              [
                ['meter_reading', 'Meter reading'],
                ['average_billing', 'Average monthly billing'],
                ['manual_amount', 'Manual amount'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm text-apg-silver">
                <input
                  type="radio"
                  name="calculationMethodRadio"
                  value={value}
                  checked={method === value}
                  onChange={() => setMethod(value)}
                  disabled={value === 'meter_reading' && meterPhotoMissing && false}
                />
                {label}
              </label>
            ))}
          </fieldset>

          {!detail.roomOccupancy.isSingleOccupancy ? (
            <div className="rounded-lg border border-white/10 bg-[#12161C] p-3">
              <label className="flex items-center gap-2 text-sm text-white">
                <input
                  type="checkbox"
                  name="sharingOverride"
                  checked={sharingOverride}
                  onChange={(e) => setSharingOverride(e.target.checked)}
                  className="rounded border-white/20"
                />
                Override sharing count
              </label>
              {sharingOverride ? (
                <label className="mt-2 block text-sm">
                  <span className="text-apg-silver">Sharing count</span>
                  <input
                    name="sharingCountOverride"
                    type="number"
                    min="1"
                    step="1"
                    value={sharingCountOverride}
                    onChange={(e) => setSharingCountOverride(e.target.value)}
                    className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-white"
                  />
                </label>
              ) : (
                <input type="hidden" name="sharingCountOverride" value={sharingCountOverride} />
              )}
            </div>
          ) : (
            <input type="hidden" name="sharingCountOverride" value="1" />
          )}

          {method === 'meter_reading' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-apg-silver">Previous meter reading</span>
                <input
                  name="previousReading"
                  type="number"
                  min="0"
                  step="1"
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
                  value={currentReading}
                  onChange={(e) => setCurrentReading(e.target.value)}
                  className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-white"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="text-apg-silver">Rate per unit (₹)</span>
                <input
                  name="ratePerUnitInr"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={ratePerUnitInr}
                  onChange={(e) => setRatePerUnitInr(e.target.value)}
                  className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-white"
                />
              </label>
            </div>
          ) : null}

          {method === 'average_billing' ? (
            <label className="block text-sm">
              <span className="text-apg-silver">Average room electricity bill (₹)</span>
              <input
                name="averageBillInr"
                type="number"
                min="0.01"
                step="0.01"
                value={averageBillInr}
                onChange={(e) => setAverageBillInr(e.target.value)}
                className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-white"
              />
            </label>
          ) : null}

          {method === 'manual_amount' ? (
            <label className="block text-sm">
              <span className="text-apg-silver">Electricity charge for this resident (₹)</span>
              <input
                name="manualChargeInr"
                type="number"
                min="0"
                step="0.01"
                value={manualChargeInr}
                onChange={(e) => setManualChargeInr(e.target.value)}
                className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-white"
              />
            </label>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox"
              name="deductFromDeposit"
              checked={deductFromDeposit}
              onChange={(e) => setDeductFromDeposit(e.target.checked)}
              className="rounded border-white/20"
            />
            Deduct electricity from deposit
          </label>

          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/5 disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save electricity settlement'}
          </button>
          {state.status === 'error' ? (
            <p className="text-xs text-rose-300">{state.message}</p>
          ) : null}
          {state.status === 'ok' ? (
            <p className="text-xs text-emerald-300">{state.message}</p>
          ) : null}
        </form>
      ) : null}

      <dl className="grid gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-apg-silver">Units consumed</dt>
          <dd className="text-white">
            {live?.ok && live.calc.unitsConsumed != null
              ? live.calc.unitsConsumed
              : detail.electricityUnits ?? '—'}
          </dd>
        </div>
        <div>
          <dt className="text-apg-silver">Total room bill</dt>
          <dd className="text-white">{paiseToInr(previewTotalBillPaise)}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Sharing count used</dt>
          <dd className="text-white">{occupants}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Resident share</dt>
          <dd className="font-semibold text-white">{paiseToInr(previewSharePaise)}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Deposit deduction</dt>
          <dd className="text-rose-300">
            {deductFromDeposit ? `−${paiseToInr(refundImpactPaise)}` : 'Not deducted'}
          </dd>
        </div>
        <div>
          <dt className="text-apg-silver">Final refund impact</dt>
          <dd className="font-semibold text-emerald-300">
            −{paiseToInr(refundImpactPaise)} from deposit refund
          </dd>
        </div>
      </dl>
    </div>
  );
}
