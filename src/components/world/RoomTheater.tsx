'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useReducedMotion } from 'framer-motion';
import type { BedSelectorBed } from '@/src/components/customer/customerBedTypes';
import { CustomerBedTile } from '@/src/components/customer/customerBedUi';
import { GlitchTransition } from '@/src/components/world/GlitchTransition';
import { RoomTheaterVideo } from '@/src/components/world/RoomTheaterVideo';
import { getFloorColor } from '@/src/lib/roomWorld/floorColors';
import {
  firstRoomIndexOnFloor,
  nextRoomIndex,
  orderRoomsForTheater,
  prevRoomIndex,
  uniqueFloors,
} from '@/src/lib/roomWorld/roomTheaterNav';
import { useRoomStore } from '@/src/stores/useRoomStore';

export type RoomTheaterRoom = {
  roomId: string;
  roomNumber: string;
  roomType: string;
  floorNumber: number;
  floorLabel: string;
  capacity: number;
  hasAc: boolean;
  availableBeds: number;
  totalBeds: number;
  beds: BedSelectorBed[];
  imageUrl?: string | null;
  videoUrl?: string | null;
};

type Props = {
  pgId: string;
  pgSlug: string;
  rooms: RoomTheaterRoom[];
  initialRoomId?: string | null;
};

const SWIPE_THRESHOLD_PX = 48;

export function RoomTheater({ pgId, pgSlug, rooms, initialRoomId = null }: Props) {
  const reduced = useReducedMotion();
  const setSelectedPg = useRoomStore((s) => s.setSelectedPg);
  const setSelectedRoom = useRoomStore((s) => s.setSelectedRoom);
  const setSelectedFloor = useRoomStore((s) => s.setSelectedFloor);

  const ordered = useMemo(() => orderRoomsForTheater(rooms), [rooms]);
  const floors = useMemo(() => uniqueFloors(ordered), [ordered]);

  const initialIndex = useMemo(() => {
    if (!initialRoomId) return 0;
    const idx = ordered.findIndex((r) => r.roomId === initialRoomId);
    return idx >= 0 ? idx : 0;
  }, [ordered, initialRoomId]);

  const [displayIndex, setDisplayIndex] = useState(initialIndex);
  const [glitchTrigger, setGlitchTrigger] = useState(0);
  const pendingIndexRef = useRef(initialIndex);
  const dragStartX = useRef<number | null>(null);

  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);

  const displayRoom = ordered[displayIndex] ?? ordered[0];
  const floorColor = displayRoom ? getFloorColor(displayRoom.floorNumber) : getFloorColor(0);

  const requestRoomIndex = useCallback(
    (nextIndex: number) => {
      if (ordered.length === 0) return;
      const clamped = ((nextIndex % ordered.length) + ordered.length) % ordered.length;
      if (clamped === displayIndex) return;
      pendingIndexRef.current = clamped;
      setGlitchTrigger((n) => n + 1);
    },
    [displayIndex, ordered.length],
  );

  const applySwap = useCallback(() => {
    const idx = pendingIndexRef.current;
    setDisplayIndex(idx);
    setSelectedBedId(null);
    const room = ordered[idx];
    if (room) {
      setSelectedPg(pgId, pgSlug);
      setSelectedRoom(room.roomId, room.floorNumber);
      setSelectedFloor(room.floorNumber);
    }
  }, [ordered, pgId, pgSlug, setSelectedFloor, setSelectedPg, setSelectedRoom]);

  useEffect(() => {
    const room = ordered[initialIndex];
    if (room) {
      setSelectedPg(pgId, pgSlug);
      setSelectedRoom(room.roomId, room.floorNumber);
      setSelectedFloor(room.floorNumber);
    }
  }, [initialIndex, ordered, pgId, pgSlug, setSelectedFloor, setSelectedPg, setSelectedRoom]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        requestRoomIndex(nextRoomIndex(displayIndex, ordered.length));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        requestRoomIndex(prevRoomIndex(displayIndex, ordered.length));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [displayIndex, ordered.length, requestRoomIndex]);

  if (!displayRoom || ordered.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-white/10 apg-glass-light p-8 text-center text-sm text-apg-silver">
        No rooms have been added to this PG yet.
      </p>
    );
  }

  function onPointerDown(e: React.PointerEvent) {
    if (reduced) return;
    dragStartX.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (reduced || dragStartX.current == null) return;
    const delta = e.clientX - dragStartX.current;
    dragStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    if (delta < 0) {
      requestRoomIndex(nextRoomIndex(displayIndex, ordered.length));
    } else {
      requestRoomIndex(prevRoomIndex(displayIndex, ordered.length));
    }
  }

  return (
    <section
      className="room-theater relative"
      aria-label="Room theater"
      data-roachie-focus="room-theater"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white sm:text-2xl">Room theater</h2>
          <p className="mt-1 max-w-xl text-sm text-apg-silver">
            Swipe or use arrow keys — walk through each room, pick a bed, then continue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Jump to floor">
          {floors.map((floorNum) => {
            const fc = getFloorColor(floorNum);
            const active = displayRoom.floorNumber === floorNum;
            const label =
              ordered.find((r) => r.floorNumber === floorNum)?.floorLabel ?? `Floor ${floorNum}`;
            return (
              <button
                key={floorNum}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => requestRoomIndex(firstRoomIndexOnFloor(ordered, floorNum))}
                className={
                  'rounded-full border px-3 py-1 text-xs font-semibold transition ' +
                  (active
                    ? 'border-white/20 text-white'
                    : 'border-white/10 text-apg-silver hover:border-white/20 hover:text-white')
                }
                style={
                  active
                    ? { borderColor: fc.accent, background: fc.accentMuted, color: fc.accent }
                    : undefined
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="room-theater-shell overflow-hidden rounded-2xl border apg-glass"
        style={{
          borderColor: `${floorColor.accent}44`,
          boxShadow: `0 0 48px ${floorColor.glow}`,
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragStartX.current = null;
        }}
      >
        <GlitchTransition trigger={glitchTrigger} onSwap={applySwap} className="room-theater-stage">
          <RoomTheaterVideo
            roomId={displayRoom.roomId}
            roomNumber={displayRoom.roomNumber}
            floorLabel={displayRoom.floorLabel}
            imageUrl={displayRoom.imageUrl}
            videoUrl={displayRoom.videoUrl}
          />

          <div
            className="room-theater-meta border-t border-white/10 p-4 sm:p-5"
            style={{ background: `linear-gradient(180deg, transparent, ${floorColor.accentMuted})` }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: floorColor.accent }}
                >
                  {displayRoom.floorLabel}
                </p>
                <h3 className="mt-0.5 text-lg font-semibold text-white sm:text-xl">
                  Room {displayRoom.roomNumber} · {displayRoom.roomType}
                </h3>
                <p className="mt-1 text-sm text-apg-silver">
                  {displayRoom.capacity}-sharing · {displayRoom.hasAc ? 'AC' : 'Non-AC'} ·{' '}
                  {displayRoom.availableBeds}/{displayRoom.totalBeds} beds free
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Previous room"
                  onClick={() => requestRoomIndex(prevRoomIndex(displayIndex, ordered.length))}
                  className="room-theater-nav-btn rounded-lg border border-white/15 px-3 py-2 text-sm text-white hover:border-white/30"
                >
                  ←
                </button>
                <span className="text-xs tabular-nums text-apg-muted">
                  {displayIndex + 1} / {ordered.length}
                </span>
                <button
                  type="button"
                  aria-label="Next room"
                  onClick={() => requestRoomIndex(nextRoomIndex(displayIndex, ordered.length))}
                  className="room-theater-nav-btn rounded-lg border border-white/15 px-3 py-2 text-sm text-white hover:border-white/30"
                >
                  →
                </button>
              </div>
            </div>
          </div>
        </GlitchTransition>

        <div className="border-t border-white/10 p-4 sm:p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-apg-silver">
            Beds in this room
          </p>
          {displayRoom.beds.length === 0 ? (
            <p className="text-sm text-apg-muted">No beds configured yet.</p>
          ) : (
            <div className="room-theater-bed-strip flex gap-3 overflow-x-auto pb-1">
              {displayRoom.beds.map((bed) => (
                <div key={bed.bedId} className="min-w-[7rem] shrink-0">
                  <CustomerBedTile
                    bed={bed}
                    isSelected={selectedBedId === bed.bedId}
                    onSelect={() => setSelectedBedId(bed.bedId)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-4 sm:p-5">
          <p className="text-xs text-apg-muted">
            {selectedBedId ? 'Bed selected — ready to continue' : 'Select a bed to continue'}
          </p>
          {selectedBedId ? (
            <Link
              href={`/pgs/${pgSlug}/rooms/${displayRoom.roomId}?bed=${selectedBedId}#bed-selector`}
              className="rounded-lg bg-apg-orange px-5 py-2.5 text-sm font-semibold text-white apg-glow-btn transition hover:brightness-110"
            >
              Continue →
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-lg bg-white/10 px-5 py-2.5 text-sm font-semibold text-apg-muted"
            >
              Continue →
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
