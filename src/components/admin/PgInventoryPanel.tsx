'use client';

import { useActionState, useState } from 'react';
import { quickAddBedAction } from '@/app/(admin)/admin/pgs/inventory-actions';
import { paiseToInr } from '@/src/lib/format';
import type { PgInventoryBedRow } from '@/src/services/pgInventory';
import { ROOM_SHARING_OPTIONS, type RoomSharingCount } from '@/src/lib/roomSharing';

type FloorRow = {
  id: string;
  floorNumber: number;
  label: string | null;
  roomCount: number;
  bedCount: number;
};

export function PgInventoryPanel({
  pgId,
  floors,
  beds,
}: {
  pgId: string;
  floors: FloorRow[];
  beds: PgInventoryBedRow[];
}) {
  const action = quickAddBedAction.bind(null, pgId);
  const [state, formAction, pending] = useActionState(action, { ok: false });
  const [sharingCount, setSharingCount] = useState<RoomSharingCount>(2);
  const [bedsToAdd, setBedsToAdd] = useState<RoomSharingCount>(2);

  return (
    <section className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Beds & pricing</h2>
        <p className="text-sm text-zinc-400">
          Add floors, rooms, beds, and rates for this PG. New beds appear on the public listing immediately.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
          <p className="text-xs text-zinc-500">Floors</p>
          <p className="text-2xl font-semibold text-white">{floors.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
          <p className="text-xs text-zinc-500">Beds</p>
          <p className="text-2xl font-semibold text-white">{beds.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
          <p className="text-xs text-zinc-500">Available</p>
          <p className="text-2xl font-semibold text-emerald-400">
            {beds.filter((b) => b.bedStatus === 'available').length}
          </p>
        </div>
      </div>

      <form action={formAction} className="grid gap-3 rounded-xl border border-zinc-800 p-4 sm:grid-cols-2">
        <h3 className="sm:col-span-2 text-sm font-medium text-zinc-300">Quick add bed</h3>
        <label className="text-sm">
          <span className="text-zinc-400">Floor number *</span>
          <input name="floorNumber" type="number" required defaultValue={0} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white" />
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">Floor label</span>
          <input name="floorLabel" placeholder="Ground" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white" />
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">Room number *</span>
          <input name="roomNumber" required placeholder="101" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white" />
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">Sharing type *</span>
          <select
            name="sharingCount"
            required
            value={sharingCount}
            onChange={(e) => {
              const next = Number(e.target.value) as RoomSharingCount;
              setSharingCount(next);
              setBedsToAdd((prev) => (prev > next ? next : prev));
            }}
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
          <span className="text-zinc-400">Beds to add *</span>
          <select
            name="bedsToAdd"
            required
            value={bedsToAdd}
            onChange={(e) => setBedsToAdd(Number(e.target.value) as RoomSharingCount)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          >
            {ROOM_SHARING_OPTIONS.filter((opt) => opt.count <= sharingCount).map((opt) => (
              <option key={opt.count} value={opt.count}>
                {opt.count === 1 ? '1 bed' : `${opt.count} beds`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300 sm:col-span-2">
          <input type="checkbox" name="hasAc" />
          Room has AC
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">Daily rate (₹)</span>
          <input name="dailyRate" type="number" min={0} step="0.01" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white" />
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">Weekly rate (₹)</span>
          <input name="weeklyRate" type="number" min={0} step="0.01" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white" />
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">Monthly rate (₹) *</span>
          <input name="monthlyRate" type="number" min={0} step="0.01" required className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white" />
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">Security deposit (₹)</span>
          <input name="securityDeposit" type="number" min={0} step="0.01" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white" />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="sm:col-span-2 rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Adding bed…' : '+ Add bed with pricing'}
        </button>
        {state.error ? <p className="sm:col-span-2 text-sm text-rose-400">{state.error}</p> : null}
        {state.ok ? (
          <p className="sm:col-span-2 text-sm text-emerald-400">{state.message ?? 'Added.'}</p>
        ) : null}
      </form>

      {beds.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-950/80 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2">Floor</th>
                <th className="px-3 py-2">Room</th>
                <th className="px-3 py-2">Bed</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Monthly</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-300">
              {beds.map((b) => (
                <tr key={b.bedId}>
                  <td className="px-3 py-2">{b.floorLabel}</td>
                  <td className="px-3 py-2">{b.roomNumber}</td>
                  <td className="px-3 py-2 font-medium text-white">{b.bedCode}</td>
                  <td className="px-3 py-2">{b.roomTypeName}</td>
                  <td className="px-3 py-2">{paiseToInr(b.monthlyRatePaise)}</td>
                  <td className="px-3 py-2 capitalize">{b.bedStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">No beds yet — use the form above to add your first bed.</p>
      )}
    </section>
  );
}
