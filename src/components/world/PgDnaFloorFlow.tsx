'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { DnaFloorRail } from '@/src/components/world/DnaFloorRail';
import { DnaSpineRoomCard } from '@/src/components/world/DnaSpineRoomCard';
import { RoomDetailSheet } from '@/src/components/world/RoomDetailSheet';
import {
  flattenFloorGroups,
  groupRoomsByFloor,
  roomAvailabilityLabel,
  spineVisualOffset,
} from '@/src/lib/roomWorld/dnaSpineLayout';
import { getFloorColor } from '@/src/lib/roomWorld/floorColors';
import type { PgSpineRoom } from '@/src/lib/roomWorld/pgSpineRoom';
import { useRoomStore } from '@/src/stores/useRoomStore';

type Props = {
  pgId: string;
  pgSlug: string;
  rooms: PgSpineRoom[];
};

/** PG DNA Floor Flow — vertical spatial spine, all rooms visible, expand on tap. */
export function PgDnaFloorFlow({ pgId, pgSlug, rooms }: Props) {
  const reduced = useReducedMotion();
  const setSelectedPg = useRoomStore((s) => s.setSelectedPg);
  const setSelectedRoom = useRoomStore((s) => s.setSelectedRoom);
  const setSelectedFloor = useRoomStore((s) => s.setSelectedFloor);

  const floorGroups = useMemo(() => groupRoomsByFloor(rooms), [rooms]);
  const ordered = useMemo(() => flattenFloorGroups(floorGroups), [floorGroups]);

  const spineRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const floorSectionRefs = useRef<Record<number, HTMLElement | null>>({});

  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
  const [sheetBedId, setSheetBedId] = useState<string | null>(null);

  const activeRoom = ordered[activeIndex] ?? ordered[0];
  const expandedRoom = expandedRoomId
    ? ordered.find((r) => r.roomId === expandedRoomId) ?? null
    : null;

  const scrollToIndex = useCallback((index: number) => {
    const el = itemRefs.current[index];
    el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }, [reduced]);

  const scrollToFloor = useCallback(
    (floorNumber: number) => {
      const section = floorSectionRefs.current[floorNumber];
      if (section) {
        section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        return;
      }
      const idx = ordered.findIndex((r) => r.floorNumber === floorNumber);
      if (idx >= 0) scrollToIndex(idx);
    },
    [ordered, reduced, scrollToIndex],
  );

  const selectRoomInStore = useCallback(
    (room: PgSpineRoom) => {
      setSelectedPg(pgId, pgSlug);
      setSelectedRoom(room.roomId, room.floorNumber);
      setSelectedFloor(room.floorNumber);
    },
    [pgId, pgSlug, setSelectedFloor, setSelectedPg, setSelectedRoom],
  );

  const openRoom = useCallback(
    (room: PgSpineRoom) => {
      selectRoomInStore(room);
      setSheetBedId(null);
      setExpandedRoomId(room.roomId);
    },
    [selectRoomInStore],
  );

  useEffect(() => {
    setSelectedPg(pgId, pgSlug);
  }, [pgId, pgSlug, setSelectedPg]);

  useEffect(() => {
    const root = spineRef.current;
    if (!root || ordered.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let best: { index: number; ratio: number } | null = null;
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.index);
          if (Number.isNaN(idx)) continue;
          const ratio = entry.intersectionRatio;
          if (!best || ratio > best.ratio) best = { index: idx, ratio };
        }
        if (best && best.ratio > 0.35) {
          setActiveIndex(best.index);
          const room = ordered[best.index];
          if (room) selectRoomInStore(room);
        }
      },
      { root, rootMargin: '-35% 0px -35% 0px', threshold: [0.35, 0.5, 0.75] },
    );

    itemRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [ordered, selectRoomInStore]);

  if (ordered.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-white/10 apg-glass-light p-8 text-center text-sm text-apg-silver">
        No rooms have been added to this PG yet.
      </p>
    );
  }

  let globalIndex = 0;

  return (
    <section className="dna-floor-flow" aria-label="PG room map" data-roachie-focus="room-dna">
      <header className="mb-4">
        <h2 className="text-xl font-semibold text-white sm:text-2xl">Living structure</h2>
        <p className="mt-1 max-w-2xl text-sm text-apg-silver">
          Every room at a glance — scroll the spine or tap any room to expand beds and walkthrough.
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
                onClick={() => scrollToIndex(index)}
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
        <div
          ref={spineRef}
          className="dna-spine-viewport min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-white/10 apg-glass-light"
        >
          {floorGroups.map((group) => (
            <section
              key={group.floorNumber}
              ref={(el) => {
                floorSectionRefs.current[group.floorNumber] = el;
              }}
              className="dna-spine-floor-section"
              aria-label={group.floorLabel}
            >
              <div
                className="sticky top-0 z-20 border-b border-white/5 px-3 py-2 backdrop-blur-md"
                style={{ background: `${getFloorColor(group.floorNumber).accentMuted}` }}
              >
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: getFloorColor(group.floorNumber).accent }}
                >
                  {group.floorLabel}
                  <span className="ml-2 font-normal text-apg-muted">
                    · {group.rooms.length} room{group.rooms.length === 1 ? '' : 's'}
                  </span>
                </p>
              </div>

              <div className="dna-spine-track py-2">
                {group.rooms.map((room) => {
                  const index = globalIndex;
                  globalIndex += 1;
                  const offset = spineVisualOffset(index, activeIndex);
                  return (
                    <div
                      key={room.roomId}
                      ref={(el) => {
                        itemRefs.current[index] = el;
                      }}
                      data-index={index}
                      className="dna-spine-slot"
                    >
                      <DnaSpineRoomCard
                        room={room}
                        spineOffset={offset}
                        reducedMotion={Boolean(reduced)}
                        onExpand={() => openRoom(room)}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

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
          onClose={() => {
            setExpandedRoomId(null);
            setSheetBedId(null);
          }}
          selectedBedId={sheetBedId}
          onSelectBed={setSheetBedId}
        />
      ) : null}
    </section>
  );
}
