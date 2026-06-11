'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { quickAddBedAction } from '@/app/(admin)/admin/pgs/inventory-actions';
import {
  buildAddRoomFormData,
  clearAddRoomFormDraft,
  EMPTY_ADD_ROOM_FORM,
  loadAddRoomFormDraft,
  saveAddRoomFormDraft,
  suggestNextRoomNumber,
  type AddRoomFormDraft,
} from '@/src/lib/addRoomFormDraft';
import { ROOM_SHARING_OPTIONS, type RoomSharingCount } from '@/src/lib/roomSharing';

export function AddRoomForm({ pgId }: { pgId: string }) {
  const action = quickAddBedAction.bind(null, pgId);
  const [state, formAction, pending] = useActionState(action, { ok: false });
  const [draft, setDraft] = useState<AddRoomFormDraft>(EMPTY_ADD_ROOM_FORM);
  const [hydrated, setHydrated] = useState(false);
  const lastSuccessMessage = useRef<string | null>(null);

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
  }, [state.ok, state.message]);

  function patch<K extends keyof AddRoomFormDraft>(key: K, value: AddRoomFormDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function onSharingChange(next: RoomSharingCount) {
    setDraft((prev) => ({
      ...prev,
      sharingCount: next,
      bedsToAdd: prev.bedsToAdd > next ? next : prev.bedsToAdd,
    }));
  }

  function clearDraft() {
    setDraft(EMPTY_ADD_ROOM_FORM);
    clearAddRoomFormDraft(pgId);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    formAction(buildAddRoomFormData(draft));
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 border-t border-zinc-800 p-4 sm:grid-cols-2">
      <p className="sm:col-span-2 text-xs text-zinc-500">
        Your entries stay filled after each add — update room number (auto-increments after save)
        or anything else for the next room. Rent is per bed; electricity is per room.
      </p>
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
      <label className="text-sm">
        <span className="text-zinc-400">Sharing type *</span>
        <select
          required
          value={draft.sharingCount}
          onChange={(e) => onSharingChange(Number(e.target.value) as RoomSharingCount)}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
        >
          {ROOM_SHARING_OPTIONS.map((opt) => (
            <option key={opt.count} value={opt.count}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="text-zinc-400">Beds to add now *</span>
        <select
          required
          value={draft.bedsToAdd}
          onChange={(e) => patch('bedsToAdd', Number(e.target.value) as RoomSharingCount)}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
        >
          {ROOM_SHARING_OPTIONS.filter((opt) => opt.count <= draft.sharingCount).map((opt) => (
            <option key={opt.count} value={opt.count}>
              {opt.count === 1
                ? '1 bed only'
                : `${opt.count} beds (fill ${opt.label})`}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-zinc-500">
          Codes auto-assigned (e.g. B1, B2). Add remaining beds later if needed.
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm text-zinc-300 sm:col-span-2">
        <input
          type="checkbox"
          checked={draft.hasAc}
          onChange={(e) => patch('hasAc', e.target.checked)}
        />
        Room has AC
      </label>
      <p className="sm:col-span-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Rent per bed (₹) —{' '}
        {ROOM_SHARING_OPTIONS.find((o) => o.count === draft.sharingCount)?.label}
      </p>
      <label className="text-sm">
        <span className="text-zinc-400">Per day</span>
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
        <span className="text-zinc-400">Per week</span>
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
        <span className="text-zinc-400">Per month *</span>
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
      <p className="sm:col-span-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Security deposit per bed (₹)
      </p>
      <label className="text-sm">
        <span className="text-zinc-400">Daily stay deposit</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={draft.dailyDeposit}
          onChange={(e) => patch('dailyDeposit', e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
        />
      </label>
      <label className="text-sm">
        <span className="text-zinc-400">Weekly stay deposit</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={draft.weeklyDeposit}
          onChange={(e) => patch('weeklyDeposit', e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
        />
      </label>
      <label className="text-sm">
        <span className="text-zinc-400">Monthly stay deposit</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={draft.monthlyDeposit}
          onChange={(e) => patch('monthlyDeposit', e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
        />
      </label>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Adding…' : '+ Add room / beds'}
        </button>
        <button
          type="button"
          onClick={clearDraft}
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          Clear form
        </button>
      </div>
      {state.error ? <p className="sm:col-span-2 text-sm text-rose-400">{state.error}</p> : null}
      {state.ok ? (
        <p className="sm:col-span-2 text-sm text-emerald-400">
          {state.message ?? 'Saved.'} Form kept — adjust room number if needed and add the next
          room.
        </p>
      ) : null}
    </form>
  );
}
