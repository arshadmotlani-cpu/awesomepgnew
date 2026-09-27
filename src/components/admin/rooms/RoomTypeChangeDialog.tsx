'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { resizeRoomCapacityAction } from '@/app/(admin)/admin/pgs/inventory-actions';
import { RoomTypeSelector } from '@/src/components/admin/RoomTypeSelector';
import { RoomCapacityChangePreview } from '@/src/components/admin/rooms/RoomCapacityChangePreview';
import { AdminOpsDialog } from '@/src/components/admin/rooms/AdminOpsDialog';
import {
  getRoomConfigurationPreset,
  presetIdFromBedCountAndName,
  type RoomConfigurationPresetId,
} from '@/src/lib/roomConfigurationPresets';
import { buildRoomCapacityChangePreview } from '@/src/lib/roomCapacityChangePreview';
import {
  RoomConfigurationEffectiveDateFields,
  type RoomConfigurationTiming,
} from '@/src/components/admin/rooms/RoomConfigurationEffectiveDateFields';
import { pickPrimaryScheduledConfigurationForEditing } from '@/src/lib/roomConfiguration/editingSchedule';
import { defaultRoomConfigurationEffectiveFrom } from '@/src/lib/roomConfiguration/effectiveDate';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { todayString } from '@/src/lib/dates';
import type { RoomIntegrityResult } from '@/src/lib/roomIntegrity/types';
import type { PgInventoryBedRow } from '@/src/services/pgInventory';
import type { ScheduledRoomConfigurationSummary } from '@/src/services/roomConfigurationSchedule';

export type { RoomConfigurationTiming };

type Props = {
  open: boolean;
  onClose: () => void;
  pgId: string;
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  beds: PgInventoryBedRow[];
  integrity?: RoomIntegrityResult;
  archivedBedCodes?: string[];
  occupiedBedIds?: Set<string>;
  hasAc?: boolean;
  scheduledConfigurations?: ScheduledRoomConfigurationSummary[];
  onToast: (message: string, tone: 'success' | 'error') => void;
};

export function RoomTypeChangeDialog({
  open,
  onClose,
  pgId,
  roomId,
  roomNumber,
  roomTypeName,
  beds,
  integrity,
  archivedBedCodes = [],
  occupiedBedIds = new Set<string>(),
  hasAc = false,
  scheduledConfigurations = [],
  onToast,
}: Props) {
  const router = useRouter();
  const today = todayString();
  const editingSchedule = pickPrimaryScheduledConfigurationForEditing(scheduledConfigurations);
  const [presetId, setPresetId] = useState<RoomConfigurationPresetId>(() =>
    editingSchedule
      ? presetIdFromBedCountAndName(editingSchedule.targetBedCount, editingSchedule.roomTypeName)
      : presetIdFromBedCountAndName(beds.length, roomTypeName),
  );
  const [timing, setTiming] = useState<RoomConfigurationTiming>(() =>
    editingSchedule ? 'scheduled' : 'scheduled',
  );
  const [scheduledEffectiveFrom, setScheduledEffectiveFrom] = useState(() =>
    editingSchedule?.effectiveFrom ?? defaultRoomConfigurationEffectiveFrom(today),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = getRoomConfigurationPreset(presetId);
  const targetChanged = preset.bedCount !== beds.length || preset.roomTypeName !== roomTypeName;
  const firstBed = beds[0];
  const [pricing, setPricing] = useState(() => {
    const source = editingSchedule ?? firstBed;
    if (!source) {
      return { monthlyRate: '', weeklyRate: '', dailyRate: '', monthlyDeposit: '' };
    }
    return {
      monthlyRate: String(source.monthlyRatePaise / 100),
      weeklyRate: String(source.weeklyRatePaise / 100),
      dailyRate: String(source.dailyRatePaise / 100),
      monthlyDeposit: String(source.monthlyDepositPaise / 100),
    };
  });

  const monthlyRatePaise = Math.round(Number.parseFloat(pricing.monthlyRate || '0') * 100);
  const weeklyRatePaise = Math.round(Number.parseFloat(pricing.weeklyRate || '0') * 100);
  const dailyRatePaise = Math.round(Number.parseFloat(pricing.dailyRate || '0') * 100);
  const depositPaise = Math.round(Number.parseFloat(pricing.monthlyDeposit || '0') * 100);

  const effectiveFromDisplay = timing === 'immediate' ? today : scheduledEffectiveFrom;

  const previewBeds = useMemo(
    () =>
      beds.map((b) => ({
        bedId: b.bedId,
        bedCode: b.bedCode,
        status: b.bedStatus as 'available' | 'maintenance' | 'blocked',
        occupied: occupiedBedIds.has(b.bedId),
      })),
    [beds, occupiedBedIds],
  );

  const capacityPreview = useMemo(
    () =>
      buildRoomCapacityChangePreview({
        currentBeds: previewBeds,
        archivedBedCodes,
        targetBedCount: preset.bedCount,
        targetLabel: preset.label,
        monthlyRatePaise,
      }),
    [previewBeds, archivedBedCodes, preset.bedCount, preset.label, monthlyRatePaise],
  );

  const previewBlocked = capacityPreview.blocked;
  const currentDepositPaise = depositPaise;

  async function onApply() {
    setPending(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('roomId', roomId);
      fd.set('presetId', presetId);
      fd.set('configurationTiming', timing);
      if (timing === 'scheduled') {
        fd.set('effectiveFrom', scheduledEffectiveFrom);
      }
      if (editingSchedule?.scheduleId) {
        fd.set('editingScheduleId', editingSchedule.scheduleId);
      }
      if (hasAc) fd.set('hasAc', 'on');
      fd.set('dailyRate', pricing.dailyRate);
      fd.set('weeklyRate', pricing.weeklyRate);
      fd.set('monthlyRate', pricing.monthlyRate);
      fd.set('dailyDeposit', pricing.monthlyDeposit);
      fd.set('weeklyDeposit', pricing.monthlyDeposit);
      fd.set('monthlyDeposit', pricing.monthlyDeposit);
      const result = await resizeRoomCapacityAction(pgId, fd);
      if (!result.ok) {
        const msg =
          result.error ??
          "Couldn't save changes. Nothing was changed.";
        setError(msg);
        onToast(msg, 'error');
        return;
      }
      if (result.timing === 'immediate') {
        onToast(
          `✓ Applied ${preset.label} immediately (effective ${formatDate(result.effectiveFrom)})`,
          'success',
        );
      } else {
        onToast(
          `✓ Scheduled ${preset.label} from ${formatDate(result.effectiveFrom)} — no billing change until then`,
          'success',
        );
      }
      setConfirmOpen(false);
      onClose();
      router.refresh();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const msg = /unexpected response was received from the server/i.test(raw)
        ? 'The server timed out or failed before completing this change. Nothing was saved — refresh the room list and try again; contact support if it repeats.'
        : raw;
      setError(msg);
      onToast(msg, 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <AdminOpsDialog
      open={open}
      onClose={() => !pending && onClose()}
      title={`Change room type — Room ${roomNumber}`}
      subtitle={`Current: ${roomTypeName} (${beds.length} bed${beds.length === 1 ? '' : 's'})`}
      width="lg"
      footer={
        targetChanged ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || previewBlocked}
              onClick={() => setConfirmOpen(true)}
              className="rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Review…
            </button>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Select a different room type to apply changes.</p>
        )
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">
          Choose whether to apply the new sharing and catalog configuration today or schedule it for
          a future billing date. Historical invoices are never rewritten.
        </p>
        <RoomConfigurationEffectiveDateFields
          today={today}
          timing={timing}
          onTimingChange={setTiming}
          scheduledEffectiveFrom={scheduledEffectiveFrom}
          onScheduledEffectiveFromChange={setScheduledEffectiveFrom}
          disabled={pending}
          editingScheduledDate={editingSchedule?.effectiveFrom ?? null}
        />
        <RoomTypeSelector value={presetId} onChange={setPresetId} disabled={pending} />
        {targetChanged ? (
          <div className="rounded-lg border border-zinc-800 p-3 space-y-3">
            <p className="text-sm font-medium text-zinc-200">
              Future pricing (effective together with sharing change)
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  { key: 'monthlyRate' as const, label: 'Monthly rent (₹)' },
                  { key: 'weeklyRate' as const, label: 'Weekly rent (₹)' },
                  { key: 'dailyRate' as const, label: 'Daily rent (₹)' },
                  { key: 'monthlyDeposit' as const, label: 'Deposit (₹)' },
                ] as const
              ).map(({ key, label }) => (
                <label key={key} className="text-sm">
                  <span className="text-zinc-400">{label}</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricing[key]}
                    onChange={(e) => setPricing((p) => ({ ...p, [key]: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
                  />
                </label>
              ))}
            </div>
          </div>
        ) : null}
        {targetChanged ? (
          <RoomCapacityChangePreview
            currentBeds={previewBeds}
            archivedBedCodes={archivedBedCodes}
            targetBedCount={preset.bedCount}
            targetLabel={preset.label}
            monthlyRatePaise={monthlyRatePaise}
          />
        ) : null}
        {integrity?.occupiedBeds ? (
          <p className="text-xs text-zinc-500">
            {integrity.occupiedBeds} resident{integrity.occupiedBeds === 1 ? '' : 's'} currently in
            this room — their bed assignments will not change.
          </p>
        ) : null}
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        {confirmOpen ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-4 text-sm text-amber-50">
            <p className="font-semibold">
              {timing === 'immediate' ? 'Confirm immediate change' : 'Confirm scheduled configuration'}
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              <li>
                Current: {roomTypeName} ({beds.length} bed{beds.length === 1 ? '' : 's'})
              </li>
              <li>
                After apply ({formatDate(effectiveFromDisplay)}): {preset.label} (capacity{' '}
                {preset.bedCount})
              </li>
              <li>Monthly: {paiseToInr(monthlyRatePaise)} · Weekly: {paiseToInr(weeklyRatePaise)} · Daily: {paiseToInr(dailyRatePaise)}</li>
              <li>Deposit (per bed): {paiseToInr(depositPaise)}</li>
              {timing === 'scheduled' ? (
                <li>No immediate rent invoice or deposit charge until the effective date.</li>
              ) : (
                <li>Configuration and pricing versions apply starting today.</li>
              )}
            </ul>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs"
                onClick={() => setConfirmOpen(false)}
              >
                Back
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white"
                onClick={() => void onApply()}
              >
                {pending
                  ? timing === 'immediate'
                    ? 'Applying…'
                    : 'Scheduling…'
                  : timing === 'immediate'
                    ? 'Confirm apply now'
                    : 'Confirm schedule'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </AdminOpsDialog>
  );
}
