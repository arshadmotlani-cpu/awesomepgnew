'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { configureRoomAction } from '@/app/(admin)/admin/pgs/inventory-actions';
import {
  buildAddRoomFormData,
  clearAddRoomFormDraft,
  EMPTY_ADD_ROOM_FORM,
  loadAddRoomFormDraft,
  saveAddRoomFormDraft,
  suggestNextRoomNumber,
  type AddRoomFormDraft,
} from '@/src/lib/addRoomFormDraft';
import {
  getRoomConfigurationPreset,
  type RoomConfigurationPresetId,
} from '@/src/lib/roomConfigurationPresets';
import { buildIntegrityPreview, previewFromBeds } from '@/src/lib/roomIntegrity/roomIntegrityPreview';
import { BedPreviewList, RoomTypeSelector } from '@/src/components/admin/RoomTypeSelector';
import { RoomIntegrityPreview } from '@/src/components/admin/RoomIntegrityPreview';

type Props = {
  pgId: string;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
};

export function CreateRoomWizard({ pgId, onSuccess, onError }: Props) {
  const action = configureRoomAction.bind(null, pgId);
  const [state, formAction, pending] = useActionState(action, { ok: false });
  const [presetId, setPresetId] = useState<RoomConfigurationPresetId>('sharing-2');
  const [draft, setDraft] = useState<AddRoomFormDraft>(() => {
    if (typeof window === 'undefined') return EMPTY_ADD_ROOM_FORM;
    return loadAddRoomFormDraft(pgId) ?? EMPTY_ADD_ROOM_FORM;
  });
  const lastSuccessMessage = useRef<string | null>(null);

  const preset = getRoomConfigurationPreset(presetId);

  useEffect(() => {
    saveAddRoomFormDraft(pgId, draft);
  }, [pgId, draft]);

  useEffect(() => {
    if (!state.ok || !state.message || state.message === lastSuccessMessage.current) return;
    lastSuccessMessage.current = state.message;
    onSuccess?.(state.message);
    setDraft((prev) => ({
      ...prev,
      roomNumber: suggestNextRoomNumber(prev.roomNumber),
    }));
  }, [state.ok, state.message, onSuccess]);

  useEffect(() => {
    if (state.error) onError?.(state.error);
  }, [state.error, onError]);

  const previewState = useMemo(
    () =>
      previewFromBeds({
        roomTypeName: preset.roomTypeName,
        targetBedCount: preset.bedCount,
        beds: Array.from({ length: preset.bedCount }, () => ({ status: 'available' as const })),
        occupiedBeds: 0,
      }),
    [preset],
  );
  const previewResult = buildIntegrityPreview(previewState);

  function patch<K extends keyof AddRoomFormDraft>(key: K, value: AddRoomFormDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fd = buildAddRoomFormData({
      ...draft,
      sharingCount: preset.bedCount as AddRoomFormDraft['sharingCount'],
      bedsToAdd: preset.bedCount as AddRoomFormDraft['bedsToAdd'],
      roomTypeName: preset.roomTypeName,
    });
    fd.set('presetId', presetId);
    formAction(fd);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-zinc-400">
        Create a room with beds and rent. Photos, description, and dimensions are optional later
        under <strong className="text-zinc-300">More → Room details</strong>.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="text-zinc-400">Room number *</span>
          <input
            required
            placeholder="304"
            value={draft.roomNumber}
            onChange={(e) => patch('roomNumber', e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          />
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">Floor *</span>
          <input
            type="number"
            required
            value={draft.floorNumber}
            onChange={(e) => patch('floorNumber', e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          />
        </label>
        <label className="flex items-center gap-2 self-end text-sm text-zinc-300 pb-2">
          <input
            type="checkbox"
            checked={draft.hasAc}
            onChange={(e) => patch('hasAc', e.target.checked)}
          />
          AC
        </label>
      </div>

      <div>
        <p className="mb-2 text-sm text-zinc-400">Room type</p>
        <RoomTypeSelector value={presetId} onChange={setPresetId} disabled={pending} />
      </div>

      <BedPreviewList presetId={presetId} />

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="text-zinc-400">Monthly rent (₹) *</span>
          <input
            type="number"
            min={0}
            step="0.01"
            required
            value={draft.monthlyRate}
            onChange={(e) => patch('monthlyRate', e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          />
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">Weekly rent (₹)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={draft.weeklyRate}
            onChange={(e) => patch('weeklyRate', e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          />
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">Daily rent (₹)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={draft.dailyRate}
            onChange={(e) => patch('dailyRate', e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          />
        </label>
      </div>

      <RoomIntegrityPreview
        capacity={previewState.storedCapacity}
        physicalBeds={previewState.physicalBeds}
        bookableBeds={previewState.bookableBeds}
        occupiedBeds={previewState.occupiedBeds}
        blockedBeds={previewState.blockedBeds}
        maintenanceBeds={previewState.maintenanceBeds}
        issues={previewResult.ok ? [] : previewResult.issues}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || !previewResult.ok || !draft.roomNumber.trim()}
          className="rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Creating room…' : 'Create room'}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(EMPTY_ADD_ROOM_FORM);
            clearAddRoomFormDraft(pgId);
          }}
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          Clear
        </button>
      </div>

      {state.error ? <p className="text-sm text-rose-400">{state.error}</p> : null}
    </form>
  );
}
