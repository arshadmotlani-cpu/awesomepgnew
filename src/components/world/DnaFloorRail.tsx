'use client';

import { getFloorColor } from '@/src/lib/roomWorld/floorColors';
import type { FloorGroup } from '@/src/lib/roomWorld/pgSpineRoom';

type Props = {
  floors: FloorGroup[];
  activeFloorNumber: number;
  onJump: (floorNumber: number) => void;
};

/** Side rail — optional floor jump without replacing rooms view. */
export function DnaFloorRail({ floors, activeFloorNumber, onJump }: Props) {
  if (floors.length <= 1) return null;

  return (
    <nav
      className="dna-floor-rail hidden shrink-0 flex-col gap-1 sm:flex"
      aria-label="Jump to floor"
    >
      {floors.map((floor) => {
        const active = floor.floorNumber === activeFloorNumber;
        const fc = getFloorColor(floor.floorNumber);
        return (
          <button
            key={floor.floorNumber}
            type="button"
            title={floor.floorLabel}
            aria-current={active ? 'true' : undefined}
            onClick={() => onJump(floor.floorNumber)}
            className={
              'rounded-lg border px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide transition ' +
              (active
                ? 'border-white/25 text-white'
                : 'border-white/10 text-apg-muted hover:border-white/20 hover:text-apg-silver')
            }
            style={
              active
                ? { borderColor: fc.accent, color: fc.accent, background: fc.accentMuted }
                : undefined
            }
          >
            {floor.shortLabel}
          </button>
        );
      })}
    </nav>
  );
}
