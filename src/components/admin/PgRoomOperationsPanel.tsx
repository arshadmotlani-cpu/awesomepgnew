'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { quickAddBedAction } from '@/app/(admin)/admin/pgs/inventory-actions';
import { paiseToInr } from '@/src/lib/format';
import type { PgInventoryBedRow } from '@/src/services/pgInventory';
import { RoomElectricityCard } from './RoomElectricityCard';
import type { MeterLog } from '@/src/db/schema/meterLogs';
import type { ElectricityBill } from '@/src/db/schema/electricityBills';
import {
  presetForSharing,
  presetRupees,
  type SharingPresetMatrix,
} from '@/src/lib/pgSharingPresets';
import { ROOM_SHARING_OPTIONS, type RoomSharingCount } from '@/src/lib/roomSharing';
import { PgSharingPresetsPanel } from './PgSharingPresetsPanel';

type FloorRow = {
  id: string;
  floorNumber: number;
  label: string | null;
  roomCount: number;
  bedCount: number;
};

type RoomMeterData = {
  roomId: string;
  roomNumber: string;
  floorLabel: string;
  logs: MeterLog[];
  latestBill: ElectricityBill | undefined;
};

type RoomGroup = {
  roomId: string;
  roomNumber: string;
  floorLabel: string;
  beds: PgInventoryBedRow[];
  meter: RoomMeterData | undefined;
};

export function PgRoomOperationsPanel({
  pgId,
  floors,
  beds,
  roomMeters,
  cloudinaryConfigured,
  sharingPresets,
}: {
  pgId: string;
  floors: FloorRow[];
  beds: PgInventoryBedRow[];
  roomMeters: RoomMeterData[];
  cloudinaryConfigured: boolean;
  sharingPresets: SharingPresetMatrix;
}) {
  const action = quickAddBedAction.bind(null, pgId);
  const [state, formAction, pending] = useActionState(action, { ok: false });
  const [showAddBed, setShowAddBed] = useState(beds.length === 0);
  const [sharingCount, setSharingCount] = useState<RoomSharingCount>(2);
  const [bedsToAdd, setBedsToAdd] = useState<RoomSharingCount>(2);

  const applyPreset = (sharing: RoomSharingCount) => {
    const row = presetForSharing(sharingPresets, sharing);
    return {
      dailyRate: presetRupees(row.dailyRatePaise),
      weeklyRate: presetRupees(row.weeklyRatePaise),
      monthlyRate: presetRupees(row.monthlyRatePaise),
      dailyDeposit: presetRupees(row.dailyDepositPaise),
      weeklyDeposit: presetRupees(row.weeklyDepositPaise),
      monthlyDeposit: presetRupees(row.monthlyDepositPaise),
    };
  };

  const [rates, setRates] = useState(() => applyPreset(2));

  useEffect(() => {
    setRates(applyPreset(sharingCount));
  }, [sharingCount, sharingPresets]);

  const roomGroups = useMemo(() => {
    const meterByRoom = new Map(roomMeters.map((r) => [r.roomId, r]));
    const byRoom = new Map<string, RoomGroup>();

    for (const bed of beds) {
      const existing = byRoom.get(bed.roomId);
      if (existing) {
        existing.beds.push(bed);
      } else {
        byRoom.set(bed.roomId, {
          roomId: bed.roomId,
          roomNumber: bed.roomNumber,
          floorLabel: bed.floorLabel,
          beds: [bed],
          meter: meterByRoom.get(bed.roomId),
        });
      }
    }

    for (const m of roomMeters) {
      if (!byRoom.has(m.roomId)) {
        byRoom.set(m.roomId, {
          roomId: m.roomId,
          roomNumber: m.roomNumber,
          floorLabel: m.floorLabel,
          beds: [],
          meter: m,
        });
      }
    }

    return [...byRoom.values()].sort((a, b) =>
      a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }),
    );
  }, [beds, roomMeters]);

  const availableCount = beds.filter((b) => b.bedStatus === 'available').length;

  return (
    <section
      id="pg-section-rooms"
      className="scroll-mt-6 space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"
    >
      <header className="space-y-2">
        <h2 className="text-lg font-semibold text-white">Rooms, rent & electricity</h2>
        <p className="text-sm text-zinc-400">
          <strong className="text-zinc-300">Rent</strong> is set per bed (daily / weekly / monthly).
          <strong className="text-zinc-300"> Electricity</strong> is separate — one meter per room,
          billed from readings and split among monthly tenants in that room by active days in the month.
        </p>
        <p className="text-xs text-amber-200/90">
          Meter photo is mandatory for verified readings. Missing photos → estimated bill from past
          average (labeled on tenant dashboard).
        </p>
      </header>

      {beds.length === 0 ? (
        <ol className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-100">
          <li className="font-semibold">Setup order for this PG</li>
          <li>1. Add at least one bed below (creates the room automatically).</li>
          <li>2. Upload monthly meter reading per room in the room cards.</li>
          <li>3. Enable QR collections and add Rent + Electricity categories.</li>
        </ol>
      ) : null}

      <PgSharingPresetsPanel pgId={pgId} initialPresets={sharingPresets} />

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Floors" value={floors.length} />
        <Stat label="Rooms" value={roomGroups.length} />
        <Stat label="Beds" value={beds.length} />
        <Stat label="Available beds" value={availableCount} highlight />
      </div>

      <div className="rounded-xl border border-zinc-800">
        <button
          type="button"
          onClick={() => setShowAddBed((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-zinc-200 hover:bg-zinc-950/50"
        >
          <span>
            {beds.length === 0 ? 'Step 1 — Add room & beds (rent)' : 'Add room or more beds'}
          </span>
          <span className="text-zinc-500">{showAddBed ? '−' : '+'}</span>
        </button>
        {showAddBed ? (
          <form
            action={formAction}
            className="grid gap-3 border-t border-zinc-800 p-4 sm:grid-cols-2"
          >
            <p className="sm:col-span-2 text-xs text-zinc-500">
              Pick room number, sharing type, and how many beds to add. Bed codes (B1, B2, …) are
              assigned automatically — no per-bed photos. Rent is per bed; electricity is per room.
            </p>
            <label className="text-sm">
              <span className="text-zinc-400">Floor number *</span>
              <input
                name="floorNumber"
                type="number"
                required
                defaultValue={0}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
              />
            </label>
            <label className="text-sm">
              <span className="text-zinc-400">Floor label</span>
              <input
                name="floorLabel"
                placeholder="Ground"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
              />
            </label>
            <label className="text-sm">
              <span className="text-zinc-400">Room number *</span>
              <input
                name="roomNumber"
                required
                placeholder="101"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
              />
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
              <span className="text-zinc-400">Beds to add now *</span>
              <select
                name="bedsToAdd"
                required
                value={bedsToAdd}
                onChange={(e) => setBedsToAdd(Number(e.target.value) as RoomSharingCount)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
              >
                {ROOM_SHARING_OPTIONS.filter((opt) => opt.count <= sharingCount).map((opt) => (
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
              <input type="checkbox" name="hasAc" />
              Room has AC
            </label>
            <p className="sm:col-span-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Rent per bed (₹) — {ROOM_SHARING_OPTIONS.find((o) => o.count === sharingCount)?.label}
            </p>
            <label className="text-sm">
              <span className="text-zinc-400">Per day</span>
              <input
                name="dailyRate"
                type="number"
                min={0}
                step="0.01"
                value={rates.dailyRate}
                onChange={(e) => setRates((r) => ({ ...r, dailyRate: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
              />
            </label>
            <label className="text-sm">
              <span className="text-zinc-400">Per week</span>
              <input
                name="weeklyRate"
                type="number"
                min={0}
                step="0.01"
                value={rates.weeklyRate}
                onChange={(e) => setRates((r) => ({ ...r, weeklyRate: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
              />
            </label>
            <label className="text-sm">
              <span className="text-zinc-400">Per month *</span>
              <input
                name="monthlyRate"
                type="number"
                min={0}
                step="0.01"
                required
                value={rates.monthlyRate}
                onChange={(e) => setRates((r) => ({ ...r, monthlyRate: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
              />
            </label>
            <p className="sm:col-span-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Security deposit per bed (₹)
            </p>
            <label className="text-sm">
              <span className="text-zinc-400">Daily stay deposit</span>
              <input
                name="dailyDeposit"
                type="number"
                min={0}
                step="0.01"
                value={rates.dailyDeposit}
                onChange={(e) => setRates((r) => ({ ...r, dailyDeposit: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
              />
            </label>
            <label className="text-sm">
              <span className="text-zinc-400">Weekly stay deposit</span>
              <input
                name="weeklyDeposit"
                type="number"
                min={0}
                step="0.01"
                value={rates.weeklyDeposit}
                onChange={(e) => setRates((r) => ({ ...r, weeklyDeposit: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
              />
            </label>
            <label className="text-sm">
              <span className="text-zinc-400">Monthly stay deposit</span>
              <input
                name="monthlyDeposit"
                type="number"
                min={0}
                step="0.01"
                value={rates.monthlyDeposit}
                onChange={(e) => setRates((r) => ({ ...r, monthlyDeposit: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="sm:col-span-2 rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? 'Adding…' : '+ Add room / beds'}
            </button>
            {state.error ? (
              <p className="sm:col-span-2 text-sm text-rose-400">{state.error}</p>
            ) : null}
            {state.ok ? (
              <p className="sm:col-span-2 text-sm text-emerald-400">
                {state.message ?? 'Saved.'} Scroll down to enter the meter reading for that room.
              </p>
            ) : null}
          </form>
        ) : null}
      </div>

      {roomGroups.length === 0 ? (
        <p className="text-sm text-zinc-500">No rooms yet. Expand “Add first bed” above.</p>
      ) : (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-zinc-300">
            {beds.length > 0 ? 'Step 2 — Per room: beds + electricity' : 'Rooms'}
          </h3>
          {roomGroups.map((room) => (
            <article
              key={room.roomId}
              className="rounded-xl border border-zinc-800 bg-zinc-950/40 overflow-hidden"
            >
              <header className="border-b border-zinc-800 bg-zinc-950/60 px-4 py-3">
                <h4 className="font-semibold text-white">
                  Room {room.roomNumber}
                  <span className="ml-2 text-sm font-normal text-zinc-500">{room.floorLabel}</span>
                </h4>
              </header>
              <div className="p-4 space-y-4">
                {room.beds.length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Beds & rent
                    </p>
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-xs text-zinc-500">
                        <tr>
                          <th className="pb-2 pr-4">Bed</th>
                          <th className="pb-2 pr-4">Sharing</th>
                          <th className="pb-2 pr-4">Monthly rent</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="text-zinc-300">
                        {room.beds.map((b) => (
                          <tr key={b.bedId}>
                            <td className="py-1 pr-4 font-medium text-white">{b.bedCode}</td>
                            <td className="py-1 pr-4">{b.roomTypeName}</td>
                            <td className="py-1 pr-4">{paiseToInr(b.monthlyRatePaise)}</td>
                            <td className="py-1 capitalize">{b.bedStatus}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">No beds in this room.</p>
                )}

                <RoomElectricityCard
                  pgId={pgId}
                  roomId={room.roomId}
                  logs={room.meter?.logs ?? []}
                  latestBill={room.meter?.latestBill}
                  cloudinaryConfigured={cloudinaryConfigured}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p
        className={`text-2xl font-semibold ${highlight ? 'text-emerald-400' : 'text-white'}`}
      >
        {value}
      </p>
    </div>
  );
}
