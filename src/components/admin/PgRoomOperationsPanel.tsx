'use client';

import { useMemo, useState } from 'react';
import type { PgInventoryBedRow } from '@/src/services/pgInventory';
import { RoomElectricityCard } from './RoomElectricityCard';
import type { MeterLog } from '@/src/db/schema/meterLogs';
import type { ElectricityBill } from '@/src/db/schema/electricityBills';
import { AddRoomForm } from './AddRoomForm';
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
  roomTypeName: string;
  sharingCount: number;
  hasAc: boolean;
  roomNotes: string | null;
  beds: PgInventoryBedRow[];
  meter: RoomMeterData | undefined;
};

export function PgRoomOperationsPanel({
  pgId,
  floors,
  beds,
  roomMeters,
  blobUploadConfigured,
  availabilitySummary,
}: {
  pgId: string;
  floors: FloorRow[];
  beds: PgInventoryBedRow[];
  roomMeters: RoomMeterData[];
  blobUploadConfigured: boolean;
  availabilitySummary?: {
    availableBeds: number;
    occupiedBeds: number;
    reservedBeds: number;
    maintenanceBeds: number;
  };
}) {
  const [showAddBed, setShowAddBed] = useState(beds.length === 0);

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
          roomTypeName: bed.roomTypeName,
          sharingCount: bed.sharingCount,
          hasAc: bed.hasAc,
          roomNotes: bed.roomNotes,
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
          roomTypeName: '—',
          sharingCount: 1,
          hasAc: false,
          roomNotes: null,
          beds: [],
          meter: m,
        });
      }
    }

    return [...byRoom.values()].sort((a, b) =>
      a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }),
    );
  }, [beds, roomMeters, floors]);

  const availableCount =
    availabilitySummary?.availableBeds ??
    beds.filter((b) => b.bedStatus === 'available').length;
  const occupiedCount = availabilitySummary?.occupiedBeds ?? null;
  const maintenanceCount = availabilitySummary?.maintenanceBeds ?? null;

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
      {occupiedCount != null || maintenanceCount != null ? (
        <p className="text-xs text-zinc-500">
          SSOT today: {availableCount} available
          {occupiedCount != null ? ` · ${occupiedCount} occupied` : ''}
          {availabilitySummary?.reservedBeds ? ` · ${availabilitySummary.reservedBeds} reserved` : ''}
          {maintenanceCount != null && maintenanceCount > 0
            ? ` · ${maintenanceCount} under maintenance`
            : ''}
        </p>
      ) : null}

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
        {showAddBed ? <AddRoomForm pgId={pgId} /> : null}
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
                  roomTypeName={room.roomTypeName}
                  sharingCount={room.sharingCount}
                  hasAc={room.hasAc}
                  roomNotes={room.roomNotes}
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
                  blobUploadConfigured={blobUploadConfigured}
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
