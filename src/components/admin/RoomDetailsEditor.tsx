'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  archiveRoomAction,
  updateRoomDetailsAction,
} from '@/app/(admin)/admin/pgs/inventory-actions';

function editableFloorLabel(label: string, floorNumber: number): string {
  const auto = `Floor ${floorNumber}`;
  return label === auto ? '' : label;
}

export function RoomDetailsEditor({
  pgId,
  roomId,
  roomNumber,
  floorNumber,
  floorLabel,
}: {
  pgId: string;
  roomId: string;
  roomNumber: string;
  floorNumber: number;
  floorLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({
    roomNumber,
    floorNumber: String(floorNumber),
    floorLabel: editableFloorLabel(floorLabel, floorNumber),
  });
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetFromProps() {
    setValues({
      roomNumber,
      floorNumber: String(floorNumber),
      floorLabel: editableFloorLabel(floorLabel, floorNumber),
    });
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set('roomId', roomId);
    fd.set('roomNumber', values.roomNumber);
    fd.set('floorNumber', values.floorNumber);
    fd.set('floorLabel', values.floorLabel);
    const result = await updateRoomDetailsAction(pgId, fd);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed to save');
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function onRemoveRoom() {
    const confirmed = window.confirm(
      `Remove room ${roomNumber} and all its beds? This cannot be undone from the admin UI. Past bookings stay in records.`,
    );
    if (!confirmed) return;
    setRemoving(true);
    setError(null);
    const result = await archiveRoomAction(pgId, roomId);
    setRemoving(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed to remove room');
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h4 className="font-semibold text-white">
          Room {roomNumber}
          <span className="ml-2 text-sm font-normal text-zinc-500">{floorLabel}</span>
        </h4>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            resetFromProps();
            setOpen((v) => !v);
            setError(null);
          }}
          className="text-xs font-medium text-[#FF5A1F] hover:underline"
        >
          {open ? 'Cancel' : 'Edit room / floor'}
        </button>
        <button
          type="button"
          onClick={onRemoveRoom}
          disabled={removing}
          className="text-xs font-medium text-rose-400 hover:underline disabled:opacity-50"
        >
          {removing ? 'Removing…' : 'Remove room'}
        </button>
      </div>
      {error && !open ? <p className="w-full text-sm text-rose-400">{error}</p> : null}

      {open ? (
        <form
          onSubmit={onSave}
          className="w-full grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 sm:grid-cols-3"
        >
          <label className="text-sm">
            <span className="text-zinc-400">Room number *</span>
            <input
              type="text"
              required
              value={values.roomNumber}
              onChange={(e) => setValues((v) => ({ ...v, roomNumber: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">Floor number *</span>
            <input
              type="number"
              required
              value={values.floorNumber}
              onChange={(e) => setValues((v) => ({ ...v, floorNumber: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
            />
            <span className="mt-1 block text-xs text-zinc-500">0 = ground, 1 = first, etc.</span>
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">Floor label</span>
            <input
              type="text"
              placeholder="First floor"
              value={values.floorLabel}
              onChange={(e) => setValues((v) => ({ ...v, floorLabel: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
            />
          </label>
          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-[#FF5A1F] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? 'Saving…' : 'Save room details'}
            </button>
            {error ? <span className="text-sm text-rose-400">{error}</span> : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
