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
import { defaultRoomConfigurationEffectiveFrom } from '@/src/lib/roomConfiguration/effectiveDate';
import { paiseToInr } from '@/src/lib/format';
import type { RoomIntegrityResult } from '@/src/lib/roomIntegrity/types';
import type { PgInventoryBedRow } from '@/src/services/pgInventory';

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
  onToast,
}: Props) {
  const router = useRouter();
  const [presetId, setPresetId] = useState<RoomConfigurationPresetId>(() =>
    presetIdFromBedCountAndName(beds.length, roomTypeName),
  );
  const [effectiveFrom, setEffectiveFrom] = useState(() => defaultRoomConfigurationEffectiveFrom());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = getRoomConfigurationPreset(presetId);
  const targetChanged = preset.bedCount !== beds.length || preset.roomTypeName !== roomTypeName;
  const firstBed = beds[0];
  const monthlyRatePaise = firstBed?.monthlyRatePaise ?? 0;

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
  const currentDepositPaise = firstBed?.monthlyDepositPaise ?? 0;

  async function onApply() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set('roomId', roomId);
    fd.set('presetId', presetId);
    fd.set('effectiveFrom', effectiveFrom);
    if (hasAc) fd.set('hasAc', 'on');
    if (firstBed) {
      fd.set('dailyRate', String(firstBed.dailyRatePaise / 100));
      fd.set('weeklyRate', String(firstBed.weeklyRatePaise / 100));
      fd.set('monthlyRate', String(firstBed.monthlyRatePaise / 100));
      fd.set('dailyDeposit', String(firstBed.dailyDepositPaise / 100));
      fd.set('weeklyDeposit', String(firstBed.weeklyDepositPaise / 100));
      fd.set('monthlyDeposit', String(firstBed.monthlyDepositPaise / 100));
    }
    const result = await resizeRoomCapacityAction(pgId, fd);
    setPending(false);
    if (!result.ok) {
      const msg = result.error ?? "Couldn't save changes. Nothing was changed.";
      setError(msg);
      onToast(msg, 'error');
      return;
    }
    onToast(
      `✓ Scheduled ${preset.label} from ${effectiveFrom} — no billing change until then`,
      'success',
    );
    setConfirmOpen(false);
    onClose();
    router.refresh();
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
              Review & schedule…
            </button>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Select a different room type to apply changes.</p>
        )
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">
          Schedules sharing, rent, and deposit for a future billing date. Current residents stay on
          today&apos;s configuration until the effective date. Historical invoices are never
          rewritten.
        </p>
        <label className="block text-sm text-zinc-300">
          <span className="text-zinc-400">Financial effective date</span>
          <input
            type="date"
            value={effectiveFrom}
            min={defaultRoomConfigurationEffectiveFrom()}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Default: next billing cycle ({defaultRoomConfigurationEffectiveFrom()}). Next rent bill
            uses new pricing from this date.
          </span>
        </label>
        <RoomTypeSelector value={presetId} onChange={setPresetId} disabled={pending} />
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
            <p className="font-semibold">Confirm scheduled configuration</p>
            <ul className="mt-2 space-y-1 text-xs">
              <li>Effective: {effectiveFrom}</li>
              <li>New rent (per bed): {paiseToInr(monthlyRatePaise)}</li>
              <li>Deposit (per bed): {paiseToInr(currentDepositPaise)}</li>
              <li>No immediate rent invoice or deposit charge.</li>
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
                {pending ? 'Scheduling…' : 'Confirm schedule'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </AdminOpsDialog>
  );
}
