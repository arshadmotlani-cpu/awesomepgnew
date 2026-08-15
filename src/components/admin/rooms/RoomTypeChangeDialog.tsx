'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { resizeRoomCapacityAction } from '@/app/(admin)/admin/pgs/inventory-actions';
import { BedPreviewList, RoomTypeSelector } from '@/src/components/admin/RoomTypeSelector';
import { RoomIntegrityPreview } from '@/src/components/admin/RoomIntegrityPreview';
import { AdminOpsDialog } from '@/src/components/admin/rooms/AdminOpsDialog';
import {
  getRoomConfigurationPreset,
  presetIdFromBedCountAndName,
  type RoomConfigurationPresetId,
} from '@/src/lib/roomConfigurationPresets';
import { buildIntegrityPreview, previewFromBeds } from '@/src/lib/roomIntegrity/roomIntegrityPreview';
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
  onToast,
}: Props) {
  const router = useRouter();
  const [presetId, setPresetId] = useState<RoomConfigurationPresetId>(() =>
    presetIdFromBedCountAndName(beds.length, roomTypeName),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = getRoomConfigurationPreset(presetId);
  const targetChanged = preset.bedCount !== beds.length || preset.roomTypeName !== roomTypeName;

  const capacityBlocked =
    preset.bedCount < beds.length &&
    (integrity?.occupiedBeds ?? 0) > preset.bedCount;

  const previewState = useMemo(() => {
    const bedStatuses = beds.map((b) => ({
      status: b.bedStatus as 'available' | 'maintenance' | 'blocked',
      occupied: false,
    }));
    while (bedStatuses.length < preset.bedCount) {
      bedStatuses.push({ status: 'available', occupied: false });
    }
    return previewFromBeds({
      roomTypeName: preset.roomTypeName,
      targetBedCount: preset.bedCount,
      beds: bedStatuses.slice(0, preset.bedCount),
      occupiedBeds: integrity?.occupiedBeds ?? 0,
    });
  }, [beds, preset, integrity?.occupiedBeds]);

  const previewResult = buildIntegrityPreview(previewState);
  const previewIssues = capacityBlocked
    ? [
        {
          code: 'occupied_exceeds_capacity' as const,
          message: `Cannot reduce room capacity. ${integrity?.occupiedBeds ?? 0} active resident${(integrity?.occupiedBeds ?? 0) === 1 ? '' : 's'} currently occupy this room. Vacate or move residents first.`,
        },
      ]
    : previewResult.ok
      ? []
      : previewResult.issues;

  async function onApply() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set('roomId', roomId);
    fd.set('presetId', presetId);
    const first = beds[0];
    if (first) {
      fd.set('dailyRate', String(first.dailyRatePaise / 100));
      fd.set('weeklyRate', String(first.weeklyRatePaise / 100));
      fd.set('monthlyRate', String(first.monthlyRatePaise / 100));
      fd.set('dailyDeposit', String(first.dailyDepositPaise / 100));
      fd.set('weeklyDeposit', String(first.weeklyDepositPaise / 100));
      fd.set('monthlyDeposit', String(first.monthlyDepositPaise / 100));
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
      `✓ Room updated — now ${result.roomTypeName}, ${result.capacity} bed${result.capacity === 1 ? '' : 's'}`,
      'success',
    );
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
              disabled={pending || previewIssues.length > 0}
              onClick={() => void onApply()}
              className="rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? 'Applying…' : `Apply ${preset.label}`}
            </button>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Select a different room type to apply changes.</p>
        )
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">
          Changing room type updates capacity and beds. Pricing stays as configured unless you edit
          rent separately. Historical bookings and invoices are not altered.
        </p>
        <RoomTypeSelector value={presetId} onChange={setPresetId} disabled={pending} />
        {preset.bedCount !== beds.length ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
            <p className="font-medium">Change room to {preset.label}?</p>
            <p className="mt-1 text-xs text-amber-200/90">
              This room will have {preset.bedCount} bookable bed
              {preset.bedCount === 1 ? '' : 's'}. Existing additional beds will be archived if empty
              per system rules. Occupied beds block unsafe reductions.
            </p>
          </div>
        ) : null}
        {preset.bedCount !== beds.length ? <BedPreviewList presetId={presetId} /> : null}
        <RoomIntegrityPreview
          capacity={previewState.storedCapacity}
          physicalBeds={previewState.physicalBeds}
          bookableBeds={previewState.bookableBeds}
          occupiedBeds={previewState.occupiedBeds}
          blockedBeds={previewState.blockedBeds}
          maintenanceBeds={previewState.maintenanceBeds}
          issues={previewIssues}
        />
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      </div>
    </AdminOpsDialog>
  );
}
