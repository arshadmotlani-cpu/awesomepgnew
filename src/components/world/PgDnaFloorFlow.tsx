'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DnaFloorRail } from '@/src/components/world/DnaFloorRail';
import { PgDnaSpineV3 } from '@/src/components/world/PgDnaSpineV3';
import { RoomDetailSheet } from '@/src/components/world/RoomDetailSheet';
import {
  flattenFloorGroups,
  groupRoomsByFloor,
  roomAvailabilityLabel,
} from '@/src/lib/roomWorld/dnaSpineLayout';
import { buildFloorBoundaries } from '@/src/lib/roomWorld/floorEngine';
import { getFloorColor } from '@/src/lib/roomWorld/floorColors';
import type { PgSpineRoom } from '@/src/lib/roomWorld/pgSpineRoom';
import { usePgDnaStore } from '@/src/stores/usePgDnaStore';
import { useRoomStore } from '@/src/stores/useRoomStore';

type Props = {
  pgId: string;
  pgSlug: string;
  rooms: PgSpineRoom[];
};

/** PG DNA Floor Flow v3 — physics spine + building map + floor rail. */
export function PgDnaFloorFlow({ pgId, pgSlug, rooms }: Props) {
  const setSelectedPg = useRoomStore((s) => s.setSelectedPg);
  const setSelectedRoom = useRoomStore((s) => s.setSelectedRoom);
  const setSelectedFloor = useRoomStore((s) => s.setSelectedFloor);

  const expandedRoomId = usePgDnaStore((s) => s.expandedRoomId);
  const closeRoom = usePgDnaStore((s) => s.closeRoom);

  const floorGroups = useMemo(() => groupRoomsByFloor(rooms), [rooms]);
  const ordered = useMemo(() => flattenFloorGroups(floorGroups), [rooms]);
  const boundaries = useMemo(() => buildFloorBoundaries(floorGroups), [floorGroups]);

  const scrollToIndexRef = useRef<(index: number) => void>(() => {});
  const [activeIndex, setActiveIndex] = useState(0);
  const [sheetBedId, setSheetBedId] = useState<string | null>(null);

  const activeRoom = ordered[activeIndex] ?? ordered[0];
  const expandedRoom = expandedRoomId
    ? ordered.find((r) => r.roomId === expandedRoomId) ?? null
    : null;

  const selectRoomInStore = useCallback(
    (room: PgSpineRoom) => {
      setSelectedPg(pgId, pgSlug);
      setSelectedRoom(room.roomId, room.floorNumber);
      setSelectedFloor(room.floorNumber);
    },
    [pgId, pgSlug, setSelectedFloor, setSelectedPg, setSelectedRoom],
  );

  const scrollToFloor = useCallback(
    (floorNumber: number) => {
      const band = boundaries.find((b) => b.floorNumber === floorNumber);
      if (band) scrollToIndexRef.current(band.startIndex);
    },
    [boundaries],
  );

  useEffect(() => {
    setSelectedPg(pgId, pgSlug);
  }, [pgId, pgSlug, setSelectedPg]);

  useEffect(() => {
    if (!expandedRoomId) setSheetBedId(null);
  }, [expandedRoomId]);

  if (ordered.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-white/10 apg-glass-light p-8 text-center text-sm text-apg-silver">
        No rooms have been added to this PG yet.
      </p>
    );
  }

  return (
    <section className="dna-floor-flow" aria-label="PG room map" data-roachie-focus="room-dna">
      <header className="mb-4">
        <h2 className="text-xl font-semibold text-white sm:text-2xl">Living structure</h2>
        <p className="mt-1 max-w-2xl text-sm text-apg-silver">
          Scroll the building spine — momentum drives depth. Tap any room to expand beds and
          walkthrough.
        </p>
      </header>

      <div className="dna-building-map mb-4 overflow-x-auto pb-1">
        <div className="flex min-w-min gap-2 px-0.5">
          {ordered.map((room, index) => {
            const fc = getFloorColor(room.floorNumber);
            const active = index === activeIndex;
            return (
              <button
                key={room.roomId}
                type="button"
                onClick={() => scrollToIndexRef.current(index)}
                className={
                  'dna-building-map-pill shrink-0 rounded-lg border px-3 py-2 text-left transition ' +
                  (active ? 'border-apg-orange/50 bg-apg-orange/10' : 'border-white/10 bg-white/5 hover:border-white/20')
                }
              >
                <span className="block text-sm font-semibold text-white">{room.roomNumber}</span>
                <span className="mt-0.5 block text-[10px] text-apg-muted">
                  {room.availableBeds}/{room.totalBeds} · {roomAvailabilityLabel(room)}
                </span>
                <span
                  className="mt-1 block h-0.5 w-full rounded-full"
                  style={{ background: active ? fc.accent : 'rgba(255,255,255,0.15)' }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3">
        <PgDnaSpineV3
          rooms={ordered}
          floorGroups={floorGroups}
          onActiveIndexChange={(index, room) => {
            setActiveIndex(index);
            selectRoomInStore(room);
          }}
          onScrollToIndexReady={(fn) => {
            scrollToIndexRef.current = fn;
          }}
        />

        <DnaFloorRail
          floors={floorGroups}
          activeFloorNumber={activeRoom?.floorNumber ?? floorGroups[0]!.floorNumber}
          onJump={scrollToFloor}
        />
      </div>

      {expandedRoom ? (
        <RoomDetailSheet
          room={expandedRoom}
          pgSlug={pgSlug}
          open={Boolean(expandedRoomId)}
          onClose={closeRoom}
          selectedBedId={sheetBedId}
          onSelectBed={setSheetBedId}
        />
      ) : null}
    </section>
  );
}
