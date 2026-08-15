'use client';

import { useMemo, useState } from 'react';
import type { PgInventoryBedRow } from '@/src/services/pgInventory';
import { CreateRoomWizard } from './CreateRoomWizard';
import { useOperationsActionToast } from '@/src/components/admin/operations/OperationsActionToast';
import { RoomOperationalCard } from '@/src/components/admin/rooms/RoomOperationalCard';
import { RoomPricingQuickTable } from '@/src/components/admin/rooms/RoomPricingQuickTable';
import type { RoomRateSnapshot } from '@/src/components/admin/rooms/roomCardFormatters';
import type { RoomIntegrityResult } from '@/src/lib/roomIntegrity/types';
import type { RoomExitQueueItem } from '@/src/lib/exit/loadRoomExitQueue';
import {
  resolveRoomTypeNameForCapacity,
  roomCapacityFromActiveBedCount,
} from '@/src/lib/roomCapacitySsot';
import type { RoomDimensions } from '@/src/lib/roomListing';

type FloorRow = {
  id: string;
  floorNumber: number;
  label: string | null;
  roomCount: number;
  bedCount: number;
};

type RoomGroup = {
  roomId: string;
  roomNumber: string;
  floorNumber: number;
  floorLabel: string;
  roomTypeName: string;
  activeBedCount: number;
  hasAc: boolean;
  roomNotes: string | null;
  listingDescription: string | null;
  images: string[];
  videos: string[];
  dimensions: RoomDimensions;
  beds: PgInventoryBedRow[];
};

export function PgRoomOperationsPanel({
  pgId,
  floors,
  beds,
  blobUploadConfigured = false,
  availabilitySummary,
  roomIntegrity = [],
  roomExitQueues = {},
}: {
  pgId: string;
  floors: FloorRow[];
  beds: PgInventoryBedRow[];
  blobUploadConfigured?: boolean;
  availabilitySummary?: {
    availableBeds: number;
    occupiedBeds: number;
    reservedBeds: number;
    maintenanceBeds: number;
  };
  roomIntegrity?: RoomIntegrityResult[];
  roomExitQueues?: Record<string, RoomExitQueueItem[]>;
}) {
  const { showToast, toastNode } = useOperationsActionToast();
  const [showAddRoom, setShowAddRoom] = useState(beds.length === 0);
  const [showPricingTable, setShowPricingTable] = useState(false);
  const [rateOverrides, setRateOverrides] = useState<Record<string, RoomRateSnapshot>>({});

  const integrityByRoomId = useMemo(
    () => new Map(roomIntegrity.map((r) => [r.roomId, r])),
    [roomIntegrity],
  );
  const roomsWithIssues = roomIntegrity.filter((r) => r.hasMismatch).length;

  const roomGroups = useMemo(() => {
    const byRoom = new Map<string, RoomGroup>();

    for (const bed of beds) {
      const existing = byRoom.get(bed.roomId);
      if (existing) {
        existing.beds.push(bed);
        existing.activeBedCount = existing.beds.length;
      } else {
        byRoom.set(bed.roomId, {
          roomId: bed.roomId,
          roomNumber: bed.roomNumber,
          floorNumber: bed.floorNumber,
          floorLabel: bed.floorLabel,
          roomTypeName: bed.roomTypeName,
          activeBedCount: 1,
          hasAc: bed.hasAc,
          roomNotes: bed.roomNotes,
          listingDescription: bed.listingDescription,
          images: bed.images,
          videos: bed.videos,
          dimensions: bed.dimensions,
          beds: [bed],
        });
      }
    }

    for (const room of byRoom.values()) {
      room.activeBedCount = roomCapacityFromActiveBedCount(room.beds.length);
      room.roomTypeName = resolveRoomTypeNameForCapacity(room.roomTypeName, room.activeBedCount);
    }

    return [...byRoom.values()].sort((a, b) =>
      a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }),
    );
  }, [beds]);

  const moveTargets = roomGroups.map((r) => ({
    roomId: r.roomId,
    label: `Room ${r.roomNumber} (${r.beds.length} beds)`,
  }));

  const availableCount =
    availabilitySummary?.availableBeds ??
    beds.filter((b) => b.bedStatus === 'available').length;
  const occupiedCount = availabilitySummary?.occupiedBeds ?? null;
  const maintenanceCount = availabilitySummary?.maintenanceBeds ?? null;

  function handleRateSaved(roomId: string, rates: RoomRateSnapshot) {
    setRateOverrides((prev) => ({ ...prev, [roomId]: rates }));
  }

  function handleToast(message: string, tone: 'success' | 'error') {
    showToast(message, tone);
  }

  return (
    <section
      id="pg-section-rooms"
      className="scroll-mt-6 space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"
    >
      {toastNode}

      <header className="space-y-2">
        <h2 className="text-lg font-semibold text-white">Rooms & rent</h2>
        <p className="text-sm text-zinc-400">
          Manage room types, beds, and rent from each room card. Listing photos and descriptions are
          optional under <strong className="text-zinc-300">More → Room details</strong>.
        </p>
      </header>

      {beds.length === 0 ? (
        <ol className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-100">
          <li className="font-semibold">Setup order for this PG</li>
          <li>1. Add your first room below.</li>
          <li>2. Enable QR collections and add Rent + Electricity categories.</li>
        </ol>
      ) : null}

      {roomsWithIssues > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
          <p className="font-medium">
            ⚠ {roomsWithIssues} room{roomsWithIssues === 1 ? '' : 's'} with configuration mismatch
          </p>
          <p className="mt-1 text-xs text-amber-200/80">
            Capacity, physical beds, and bookable beds must stay aligned unless beds are intentionally
            blocked or disabled.
          </p>
        </div>
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowAddRoom((v) => !v)}
          className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          {showAddRoom ? '− Hide add room' : '+ Add room'}
        </button>
        {roomGroups.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowPricingTable((v) => !v)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
          >
            {showPricingTable ? '− Hide pricing table' : 'Manage pricing'}
          </button>
        ) : null}
      </div>

      {showAddRoom ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <CreateRoomWizard
            pgId={pgId}
            onSuccess={(message) => showToast(`✓ ${message}`, 'success')}
            onError={(message) => showToast(message, 'error')}
          />
        </div>
      ) : null}

      {showPricingTable && roomGroups.length > 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <h3 className="mb-3 text-sm font-medium text-zinc-300">Quick pricing</h3>
          <RoomPricingQuickTable
            pgId={pgId}
            rooms={roomGroups}
            rateOverrides={rateOverrides}
            onRateSaved={handleRateSaved}
            onToast={handleToast}
          />
        </div>
      ) : null}

      {roomGroups.length === 0 ? (
        <p className="text-sm text-zinc-500">No rooms yet. Click &quot;+ Add room&quot; above.</p>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">Rooms ({roomGroups.length})</h3>
          {roomGroups.map((room) => (
            <RoomOperationalCard
              key={room.roomId}
              pgId={pgId}
              roomId={room.roomId}
              roomNumber={room.roomNumber}
              floorNumber={room.floorNumber}
              floorLabel={room.floorLabel}
              roomTypeName={room.roomTypeName}
              hasAc={room.hasAc}
              roomNotes={room.roomNotes}
              listingDescription={room.listingDescription}
              images={room.images}
              videos={room.videos}
              dimensions={room.dimensions}
              blobUploadConfigured={blobUploadConfigured}
              beds={room.beds}
              integrity={integrityByRoomId.get(room.roomId)}
              moveTargets={moveTargets}
              exitQueue={roomExitQueues[room.roomId]}
              rateOverride={rateOverrides[room.roomId]}
              onRateSaved={handleRateSaved}
              onToast={handleToast}
            />
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
