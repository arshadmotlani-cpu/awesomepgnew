'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { quickAddBedAction } from '@/app/(admin)/admin/pgs/inventory-actions';
import type { PgInventoryBedRow } from '@/src/services/pgInventory';
import { RoomElectricityCard } from './RoomElectricityCard';
import type { MeterLog } from '@/src/db/schema/meterLogs';
import type { ElectricityBill } from '@/src/db/schema/electricityBills';
import { ROOM_SHARING_OPTIONS, type RoomSharingCount } from '@/src/lib/roomSharing';
import { RoomDetailsEditor } from './RoomDetailsEditor';
import { RoomPricingEditor } from './RoomPricingEditor';

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
  floorNumber: number;
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
}: {
  pgId: string;
  floors: FloorRow[];
  beds: PgInventoryBedRow[];
  roomMeters: RoomMeterData[];
  cloudinaryConfigured: boolean;
}) {
  const action = quickAddBedAction.bind(null, pgId);
  const [state, formAction, pending] = useActionState(action, { ok: false });
  const [showAddBed, setShowAddBed] = useState(beds.length === 0);
  const [sharingCount, setSharingCount] = useState<RoomSharingCount>(2);
  const [bedsToAdd, setBedsToAdd] = useState<RoomSharingCount>(2);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (state.ok) setFormKey((k) => k + 1);
  }, [state.ok]);

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
          floorNumber: bed.floorNumber,
          floorLabel: bed.floorLabel,
          beds: [bed],
          meter: meterByRoom.get(bed.roomId),
        });
      }
    }

    for (const m of roomMeters) {
      if (!byRoom.has(m.roomId)) {
        const floorFromMeter = floors.find((f) => m.floorLabel.includes(String(f.floorNumber)));
        byRoom.set(m.roomId, {
          roomId: m.roomId,
          roomNumber: m.roomNumber,
          floorNumber: floorFromMeter?.floorNumber ?? 0,
          floorLabel: m.floorLabel,
          beds: [],
          meter: m,
        });
      }
    }

    return [...byRoom.values()].sort((a, b) =>
      a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }),
    );
  }, [beds, roomMeters, floors]);

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
            key={formKey}
            action={formAction}
            className="grid gap-3 border-t border-zinc-800 p-4 sm:grid-cols-2"
          >
            <p className="sm:col-span-2 text-xs text-zinc-500">
              Enter room details and rent for this room only. Bed codes (B1, B2, …) are assigned
              automatically. Rent is per bed; electricity is per room.
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
                <RoomDetailsEditor
                  pgId={pgId}
                  roomId={room.roomId}
                  roomNumber={room.roomNumber}
                  floorNumber={room.floorNumber}
                  floorLabel={room.floorLabel}
                />
              </header>
              <div className="p-4 space-y-4">
                {room.beds.length > 0 ? (
                  <RoomPricingEditor pgId={pgId} roomId={room.roomId} beds={room.beds} />
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
