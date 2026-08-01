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

export function CreateRoomWizard({ pgId }: { pgId: string }) {
  const action = configureRoomAction.bind(null, pgId);
  const [state, formAction, pending] = useActionState(action, { ok: false });
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [presetId, setPresetId] = useState<RoomConfigurationPresetId>('sharing-2');
  const [draft, setDraft] = useState<AddRoomFormDraft>(EMPTY_ADD_ROOM_FORM);
  const [hydrated, setHydrated] = useState(false);
  const lastSuccessMessage = useRef<string | null>(null);

  const preset = getRoomConfigurationPreset(presetId);

  useEffect(() => {
    const saved = loadAddRoomFormDraft(pgId);
    if (saved) setDraft(saved);
    setHydrated(true);
  }, [pgId]);

  useEffect(() => {
    if (!hydrated) return;
    saveAddRoomFormDraft(pgId, draft);
  }, [pgId, draft, hydrated]);

  useEffect(() => {
    if (!state.ok || !state.message || state.message === lastSuccessMessage.current) return;
    lastSuccessMessage.current = state.message;
    setDraft((prev) => ({
      ...prev,
      roomNumber: suggestNextRoomNumber(prev.roomNumber),
    }));
    setStep(1);
  }, [state.ok, state.message]);

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
    <form onSubmit={onSubmit} className="space-y-4 border-t border-zinc-800 p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <StepChip n={1} label="Location" active={step === 1} done={step > 1} />
        <StepChip n={2} label="Room type" active={step === 2} done={step > 2} />
        <StepChip n={3} label="Rent & review" active={step === 3} done={false} />
      </div>

      {step === 1 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-zinc-400">Floor number *</span>
            <input
              type="number"
              required
              value={draft.floorNumber}
              onChange={(e) => patch('floorNumber', e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">Floor label</span>
            <input
              placeholder="Ground"
              value={draft.floorLabel}
              onChange={(e) => patch('floorLabel', e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">Room number *</span>
            <input
              required
              placeholder="101"
              value={draft.roomNumber}
              onChange={(e) => patch('roomNumber', e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            />
          </label>
          <label className="flex items-center gap-2 self-end text-sm text-zinc-300 pb-2">
            <input
              type="checkbox"
              checked={draft.hasAc}
              onChange={(e) => patch('hasAc', e.target.checked)}
            />
            Room has AC
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!draft.roomNumber.trim()}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Next — choose room type
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm text-zinc-400">Step 2 — Select room type</p>
            <RoomTypeSelector value={presetId} onChange={setPresetId} />
          </div>
          <BedPreviewList presetId={presetId} />
          <RoomIntegrityPreview
            capacity={previewState.storedCapacity}
            physicalBeds={previewState.physicalBeds}
            bookableBeds={previewState.bookableBeds}
            occupiedBeds={previewState.occupiedBeds}
            blockedBeds={previewState.blockedBeds}
            maintenanceBeds={previewState.maintenanceBeds}
            issues={previewResult.ok ? [] : previewResult.issues}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white"
            >
              Next — set rent
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Step 3 — Rent per bed for {preset.label} ({preset.bedCount} bed
            {preset.bedCount === 1 ? '' : 's'})
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="text-zinc-400">Per day (₹)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={draft.dailyRate}
                onChange={(e) => patch('dailyRate', e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
              />
            </label>
            <label className="text-sm">
              <span className="text-zinc-400">Per week (₹)</span>
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
              <span className="text-zinc-400">Per month (₹) *</span>
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
              type="button"
              onClick={() => setStep(2)}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={pending || !previewResult.ok}
              className="rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? 'Creating room…' : `Create ${preset.label} room`}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(EMPTY_ADD_ROOM_FORM);
                clearAddRoomFormDraft(pgId);
                setStep(1);
              }}
              className="text-sm text-zinc-500 hover:text-zinc-300"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {state.error ? <p className="text-sm text-rose-400">{state.error}</p> : null}
      {state.ok ? (
        <p className="text-sm text-emerald-400">
          {state.message ?? 'Room created.'} Start another room below.
        </p>
      ) : null}
    </form>
  );
}

function StepChip({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
        active
          ? 'bg-[#FF5A1F]/20 text-[#FF5A1F]'
          : done
            ? 'bg-emerald-950/40 text-emerald-300'
            : 'bg-zinc-900 text-zinc-500'
      }`}
    >
      <span className="font-semibold">{n}.</span> {label}
    </span>
  );
}
