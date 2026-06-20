'use client';

import type { FloorBoundary } from '@/src/lib/roomWorld/floorEngine';
import { getFloorBoundaryAtIndex } from '@/src/lib/roomWorld/floorEngine';
import { getFloorColor } from '@/src/lib/roomWorld/floorColors';

type Props = {
  activeIndex: number;
  boundaries: FloorBoundary[];
};

/** Building floor overlay — structural band indicator during physics scroll. */
export function PgFloorOverlay({ activeIndex, boundaries }: Props) {
  const floor = getFloorBoundaryAtIndex(activeIndex, boundaries);
  if (!floor) return null;

  const fc = getFloorColor(floor.floorNumber);

  return (
    <div
      className="dna-floor-overlay pointer-events-none absolute right-3 top-1/2 z-30 -translate-y-1/2 sm:right-5"
      aria-live="polite"
      aria-label={`Current floor: ${floor.floorLabel}`}
    >
      <div
        className="rounded-lg border px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm"
        style={{
          borderColor: `${fc.accent}66`,
          color: fc.accent,
          background: fc.accentMuted,
        }}
      >
        <span className="block opacity-70">Floor</span>
        <span className="mt-0.5 block text-sm">{floor.shortLabel}</span>
      </div>
    </div>
  );
}
