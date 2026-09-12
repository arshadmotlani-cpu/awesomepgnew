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

  async function onApply() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set('roomId', roomId);
    fd.set('presetId', presetId);
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
              disabled={pending || previewBlocked}
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
          Changing room type updates capacity and beds. Existing bed identities (B1, B2, …) are
          preserved. Pricing stays as configured unless you edit rent separately. Historical
          bookings and invoices are not altered.
        </p>
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
      </div>
    </AdminOpsDialog>
  );
}
