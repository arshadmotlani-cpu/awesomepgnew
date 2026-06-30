'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateCheckoutElectricityAction,
  type CheckoutSettlementActionState,
} from '@/app/(admin)/admin/checkout-settlements/actions';
import { CheckoutRoomElectricityBreakdown } from '@/src/components/admin/checkout/CheckoutRoomElectricityBreakdown';
import {
  calculateAverageBillingElectricity,
  calculateCheckoutElectricity,
  calculateManualElectricityCharge,
  effectiveSharingCount,
  type ElectricityCalculationMethod,
} from '@/src/lib/checkout/electricitySettlementCalc';
import type { RoomElectricityCheckoutAllocation } from '@/src/lib/checkout/roomElectricityAllocation';
import { paiseToInr } from '@/src/lib/format';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

const idle: CheckoutSettlementActionState = { status: 'idle' };

export type ElectricityLivePreview = {
  electricityDeductionPaise: number;
  unitsConsumed: number | null;
  residentSharePaise: number;
};

const METHOD_OPTIONS: { value: ElectricityCalculationMethod; label: string }[] = [
  { value: 'meter_reading', label: 'Meter Reading' },
  { value: 'average_billing', label: 'Average Billing' },
  { value: 'manual_amount', label: 'Manual Amount' },
];

const FIELD =
  'apg-admin-field mt-2 block w-full rounded-2xl border border-white/[0.08] bg-[#12161C] px-4 py-3.5 text-lg text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none';

export function CheckoutSettlementElectricitySection({
  detail,
  editable,
  operatorMode = false,
  autoSave = false,
  onLivePreviewChange,
}: {
  detail: CheckoutSettlementDetail;
  editable: boolean;
  operatorMode?: boolean;
  autoSave?: boolean;
  onLivePreviewChange?: (preview: ElectricityLivePreview | null) => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const settlementIdRef = useRef(detail.id);
  const [state, action, pending] = useActionState(updateCheckoutElectricityAction, idle);
  const [mounted, setMounted] = useState(false);
  const [timelineAllocation, setTimelineAllocation] =
    useState<RoomElectricityCheckoutAllocation | null>(detail.roomElectricityAllocation);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const [method, setMethod] = useState<ElectricityCalculationMethod>(() => {
    if (detail.electricityUseAverage && detail.electricityCalculationMethod === 'meter_reading') {
      return 'average_billing';
    }
    return (detail.electricityCalculationMethod as ElectricityCalculationMethod) ?? 'meter_reading';
  });
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
  const [roomDataHint, setRoomDataHint] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!editable || !detail.roomId) return;
    let cancelled = false;
    void fetch(`/api/admin/rooms/${detail.roomId}/last-electricity-reading`)
      .then((res) => res.json())
      .then((body: { ok?: boolean; data?: { previousReadingUnits?: number; ratePerUnitPaise?: number; estimatedAverageBillPaise?: number } }) => {
        if (cancelled || !body.ok || !body.data) return;
        const d = body.data;
        if (!previousReading && d.previousReadingUnits != null && d.previousReadingUnits > 0) {
          setPreviousReading(String(d.previousReadingUnits));
        }
        if (d.ratePerUnitPaise != null && ratePerUnitInr === '16') {
          setRatePerUnitInr((d.ratePerUnitPaise / 100).toFixed(2));
        }
        if (
          detail.electricityUseAverage &&
          !averageBillInr &&
          d.estimatedAverageBillPaise != null &&
          d.estimatedAverageBillPaise > 0
        ) {
          setAverageBillInr((d.estimatedAverageBillPaise / 100).toFixed(2));
          setMethod('average_billing');
        }
        setRoomDataHint(
          d.estimatedAverageBillPaise
            ? `Room history loaded — suggested average bill ₹${(d.estimatedAverageBillPaise / 100).toFixed(0)}`
            : 'Room meter history loaded',
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefetch once per room
  }, [detail.roomId, editable]);

  useEffect(() => {
    if (meterPhotoMissing && method === 'meter_reading') {
      setMethod('average_billing');
    }
  }, [meterPhotoMissing, method]);

  useEffect(() => {
    if (settlementIdRef.current !== detail.id) {
      settlementIdRef.current = detail.id;
      lastSavedSnapshotRef.current = null;
    }
    setTimelineAllocation(detail.roomElectricityAllocation);
  }, [detail.id, detail.roomElectricityAllocation]);

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

  const previewTotalBillPaise = live?.ok
    ? live.calc.totalBillPaise
    : detail.electricityTotalBillPaise;
  const timelineSharePaise = timelineAllocation?.currentResidentSharePaise;
  const previewSharePaise =
    method === 'manual_amount'
      ? live?.ok
        ? live.calc.sharePaise
        : detail.manualChargePaise ?? detail.electricitySharePaise
      : timelineSharePaise != null
        ? timelineSharePaise
        : live?.ok
          ? live.calc.sharePaise
          : detail.electricitySharePaise;
  const electricityDeductionPaise = deductFromDeposit ? previewSharePaise : 0;
  const unitsConsumed =
    live?.ok && live.calc.unitsConsumed != null
      ? live.calc.unitsConsumed
      : detail.electricityUnits != null
        ? Number(detail.electricityUnits)
        : null;

  useEffect(() => {
    if (!onLivePreviewChange) return;
    const timer = window.setTimeout(() => {
      if (!live?.ok) {
        onLivePreviewChange(null);
        return;
      }
      onLivePreviewChange({
        electricityDeductionPaise,
        unitsConsumed,
        residentSharePaise: previewSharePaise,
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [
    onLivePreviewChange,
    live?.ok,
    electricityDeductionPaise,
    unitsConsumed,
    previewSharePaise,
  ]);

  const formSnapshot = useMemo(
    () =>
      JSON.stringify({
        method,
        meterPhotoMissing,
        sharingOverride,
        sharingCountOverride,
        previousReading,
        currentReading,
        ratePerUnitInr,
        averageBillInr,
        manualChargeInr,
        deductFromDeposit,
      }),
    [
      method,
      meterPhotoMissing,
      sharingOverride,
      sharingCountOverride,
      previousReading,
      currentReading,
      ratePerUnitInr,
      averageBillInr,
      manualChargeInr,
      deductFromDeposit,
    ],
  );

  const baselineSavedSnapshot = useMemo(
    () =>
      JSON.stringify({
        method: detail.electricityUseAverage && detail.electricityCalculationMethod === 'meter_reading'
          ? 'average_billing'
          : detail.electricityCalculationMethod,
        meterPhotoMissing: detail.meterPhotoMissing,
        sharingOverride: detail.electricitySharingOverride,
        sharingCountOverride: String(
          detail.electricityOccupants ?? detail.roomOccupancy.autoDetectedCount,
        ),
        previousReading: detail.electricityPreviousReading ?? '',
        currentReading: detail.electricityCurrentReading ?? '',
        ratePerUnitInr:
          detail.electricityUnitRatePaise != null
            ? (detail.electricityUnitRatePaise / 100).toFixed(2)
            : '16',
        averageBillInr:
          detail.averageBillPaise != null ? (detail.averageBillPaise / 100).toFixed(2) : '',
        manualChargeInr:
          detail.manualChargePaise != null
            ? (detail.manualChargePaise / 100).toFixed(2)
            : detail.electricitySharePaise > 0
              ? (detail.electricitySharePaise / 100).toFixed(2)
              : '',
        deductFromDeposit: detail.electricityDeductFromDeposit !== false,
      }),
    [detail],
  );

  useEffect(() => {
    if (state.status === 'ok') {
      lastSavedSnapshotRef.current = formSnapshot;
      if (!autoSave) router.refresh();
    }
  }, [state.status, autoSave, router, formSnapshot]);

  useEffect(() => {
    if (!autoSave || !editable || !mounted || !live?.ok) return;
    const saved = lastSavedSnapshotRef.current ?? baselineSavedSnapshot;
    if (formSnapshot === saved) return;
    const timer = window.setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [autoSave, editable, mounted, live?.ok, formSnapshot, baselineSavedSnapshot]);

  useEffect(() => {
    if (method !== 'meter_reading' || !detail.roomId) return;
    const prev = Number(previousReading);
    const cur = Number(currentReading);
    const rate = Number(ratePerUnitInr);
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || !Number.isFinite(rate) || rate <= 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setTimelineLoading(true);
      const params = new URLSearchParams({
        previousReading: String(prev),
        currentReading: String(cur),
        ratePerUnitInr: String(rate),
      });
      void fetch(
        `/api/admin/checkout-settlements/${detail.id}/room-electricity-preview?${params}`,
        { cache: 'no-store' },
      )
        .then((res) => res.json())
        .then((body: { ok?: boolean; data?: RoomElectricityCheckoutAllocation }) => {
          if (body.ok && body.data) setTimelineAllocation(body.data);
        })
        .catch(() => undefined)
        .finally(() => setTimelineLoading(false));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [detail.id, detail.roomId, method, previousReading, currentReading, ratePerUnitInr]);

  if (operatorMode) {
    return (
      <div className="space-y-8">
        {editable ? (
          <form ref={formRef} action={action} className="space-y-8">
            <input type="hidden" name="settlementId" value={detail.id} />
            <input type="hidden" name="calculationMethod" value={method} />
            <input type="hidden" name="meterPhotoMissing" value={meterPhotoMissing ? 'on' : ''} />
            <input type="hidden" name="deductFromDeposit" value={deductFromDeposit ? 'on' : ''} />
            <input type="hidden" name="sharingOverride" value={sharingOverride ? 'on' : ''} />
            <input type="hidden" name="sharingCountOverride" value={sharingCountOverride} />

            <fieldset className="space-y-3">
              <legend className="sr-only">Electricity calculation method</legend>
              {METHOD_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={
                    'flex cursor-pointer items-center gap-4 rounded-2xl px-5 py-4 transition ' +
                    (method === option.value
                      ? 'bg-white/[0.08] ring-1 ring-white/15'
                      : 'hover:bg-white/[0.04]')
                  }
                >
                  <input
                    type="radio"
                    name="calculationMethodRadio"
                    value={option.value}
                    checked={method === option.value}
                    onChange={() => setMethod(option.value)}
                    className="h-4 w-4 border-white/30 bg-transparent text-[#FF5A1F] focus:ring-[#FF5A1F]"
                  />
                  <span className="text-base font-medium text-white">{option.label}</span>
                </label>
              ))}
            </fieldset>

            {method === 'meter_reading' ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-apg-silver">Previous reading</span>
                  <input
                    name="previousReading"
                    type="number"
                    min="0"
                    step="1"
                    value={previousReading}
                    onChange={(e) => setPreviousReading(e.target.value)}
                    className={FIELD}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-apg-silver">Current reading</span>
                  <input
                    name="currentReading"
                    type="number"
                    min="0"
                    step="1"
                    value={currentReading}
                    onChange={(e) => setCurrentReading(e.target.value)}
                    className={FIELD}
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="text-apg-silver">Rate per unit (₹)</span>
                  <input
                    name="ratePerUnitInr"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={ratePerUnitInr}
                    onChange={(e) => setRatePerUnitInr(e.target.value)}
                    className={FIELD}
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
                  className={FIELD}
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
                  className={FIELD}
                />
              </label>
            ) : null}

            {pending ? (
              <p className="text-sm text-apg-silver">Saving…</p>
            ) : null}
            {state.status === 'error' ? (
              <p className="text-sm text-rose-300">{state.message}</p>
            ) : null}
          </form>
        ) : null}

        <div className="grid gap-4 rounded-3xl bg-[#12161C]/80 p-6 sm:grid-cols-3">
          <LiveStat label="Units consumed" value={unitsConsumed != null ? String(unitsConsumed) : '—'} />
          <LiveStat label="Resident share" value={paiseToInr(previewSharePaise)} />
          <LiveStat
            label="Electricity deduction"
            value={deductFromDeposit ? `−${paiseToInr(electricityDeductionPaise)}` : 'Not deducted'}
            accent
          />
        </div>

        <CheckoutRoomElectricityBreakdown
          allocation={timelineAllocation}
          liveTotalBillPaise={previewTotalBillPaise}
          liveSharePaise={previewSharePaise}
          loading={timelineLoading}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {detail.meterPhotoEvidence.fetchable && detail.meterPhotoEvidence.viewUrl ? (
        <a
          href={detail.meterPhotoEvidence.viewUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-[#FF5A1F] hover:underline"
        >
          View resident meter photo
        </a>
      ) : detail.electricityMeterPhotoUrl && detail.meterPhotoEvidence.status === 'image_missing' ? (
        <p className="text-sm text-rose-300">
          Meter photo on file but image is missing — ask resident to re-upload.
        </p>
      ) : meterPhotoMissing ? (
        <p className="text-sm text-amber-200">Resident did not upload a meter photo.</p>
      ) : (
        <p className="text-sm text-apg-silver">Awaiting resident meter photo or admin settlement.</p>
      )}
      {roomDataHint ? <p className="text-xs text-sky-200">{roomDataHint}</p> : null}

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
            {METHOD_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm text-apg-silver">
                <input
                  type="radio"
                  name="calculationMethodRadio"
                  value={option.value}
                  checked={method === option.value}
                  onChange={() => setMethod(option.value)}
                />
                {option.label}
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
            <div className="space-y-2">
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
              {detail.roomId ? (
                <button
                  type="button"
                  className="rounded-lg border border-sky-400/40 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/10"
                  onClick={() => {
                    void fetch(`/api/admin/rooms/${detail.roomId}/last-electricity-reading`)
                      .then((res) => res.json())
                      .then((body: { ok?: boolean; data?: { estimatedAverageBillPaise?: number } }) => {
                        if (!body.ok || !body.data?.estimatedAverageBillPaise) return;
                        setAverageBillInr((body.data.estimatedAverageBillPaise / 100).toFixed(2));
                      });
                  }}
                >
                  Suggest room average from history
                </button>
              ) : null}
            </div>
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
            {pending ? 'Updating…' : 'Save electricity settlement'}
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
          <dt className="text-apg-silver">Occupants (detected / used)</dt>
          <dd className="text-white">
            {detail.roomOccupancy.autoDetectedCount} detected · {occupants} used
          </dd>
        </div>
        <div>
          <dt className="text-apg-silver">Resident share</dt>
          <dd className="font-semibold text-white">{paiseToInr(previewSharePaise)}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Deposit deduction</dt>
          <dd className="text-rose-300">
            {deductFromDeposit ? `−${paiseToInr(electricityDeductionPaise)}` : 'Not deducted'}
          </dd>
        </div>
        <div>
          <dt className="text-apg-silver">Final refund impact</dt>
          <dd className="font-semibold text-emerald-300">
            −{paiseToInr(electricityDeductionPaise)} from deposit refund
          </dd>
        </div>
      </dl>
    </div>
  );
}

function LiveStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-apg-silver">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${accent ? 'text-[#FF5A1F]' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}
