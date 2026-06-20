'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { PgFloorOverlay } from '@/src/components/world/PgFloorOverlay';
import { PgRoomCardV3 } from '@/src/components/world/PgRoomCardV3';
import {
  buildFloorBoundaries,
  DNA_SPINE_ITEM_HEIGHT,
} from '@/src/lib/roomWorld/floorEngine';
import { useDnaPhysicsScroll } from '@/src/lib/roomWorld/useDnaPhysicsScroll';
import type { FloorGroup, PgSpineRoom } from '@/src/lib/roomWorld/pgSpineRoom';

type Props = {
  rooms: PgSpineRoom[];
  floorGroups: FloorGroup[];
  onActiveIndexChange?: (index: number, room: PgSpineRoom) => void;
  onScrollToIndexReady?: (scrollToIndex: (index: number) => void) => void;
};

const SPINE_TOP_PAD = 48;
const SPINE_BOTTOM_PAD = 120;

/** DNA Spine v3 — physics inertia scroll, continuous motion, floor constraints. */
export function PgDnaSpineV3({
  rooms,
  floorGroups,
  onActiveIndexChange,
  onScrollToIndexReady,
}: Props) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const boundaries = useMemo(() => buildFloorBoundaries(floorGroups), [floorGroups]);
  const itemHeight = DNA_SPINE_ITEM_HEIGHT;

  const { velocity, activeIndex, fractionalIndex, viewportHeight } =
    useDnaPhysicsScroll(ref, itemHeight);

  const fieldHeight =
    rooms.length * itemHeight + SPINE_TOP_PAD + SPINE_BOTTOM_PAD + viewportHeight * 0.5;

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = ref.current;
      if (!el) return;
      const target = Math.max(0, index * itemHeight - (el.clientHeight / 2 - itemHeight / 2));
      el.scrollTo({ top: target, behavior: reduced ? 'auto' : 'smooth' });
    },
    [itemHeight, reduced],
  );

  useEffect(() => {
    onScrollToIndexReady?.(scrollToIndex);
  }, [onScrollToIndexReady, scrollToIndex]);

  useEffect(() => {
    const room = rooms[activeIndex];
    if (room) onActiveIndexChange?.(activeIndex, room);
  }, [activeIndex, onActiveIndexChange, rooms]);

  return (
    <div className="dna-spine-v3-wrap relative flex-1">
      <PgFloorOverlay activeIndex={activeIndex} boundaries={boundaries} />
      <div
        ref={ref}
        className="dna-spine-v3-viewport max-h-[min(72vh,640px)] overflow-y-auto overscroll-contain rounded-2xl border border-white/10 apg-glass-light"
      >
        <div
          className="dna-spine-v3-field relative"
          style={{
            height: fieldHeight,
            paddingTop: SPINE_TOP_PAD,
            paddingBottom: SPINE_BOTTOM_PAD,
          }}
        >
          {rooms.map((room, i) => (
            <PgRoomCardV3
              key={room.roomId}
              room={room}
              index={i}
              fractionalIndex={fractionalIndex}
              velocity={velocity}
              itemHeight={itemHeight}
              reducedMotion={Boolean(reduced)}
            />
          ))}

          {boundaries.map((band) => (
            <div
              key={band.floorNumber}
              className="dna-spine-v3-floor-band pointer-events-none absolute left-0 right-0 border-t border-white/5"
              style={{
                top: band.startIndex * itemHeight + SPINE_TOP_PAD - 8,
                height: (band.endIndex - band.startIndex + 1) * itemHeight + 16,
              }}
              aria-hidden
            />
          ))}
        </div>
      </div>
    </div>
  );
}
