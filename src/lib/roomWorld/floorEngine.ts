import type { FloorGroup } from '@/src/lib/roomWorld/pgSpineRoom';

/** Default slot height when not measured — matches CSS min card stride. */
export const DNA_SPINE_ITEM_HEIGHT = 128;

export function getFloorFromIndex(index: number, roomsPerFloor = 6): number {
  return Math.floor(Math.max(0, index) / roomsPerFloor);
}

export function getFloorRange(floor: number, roomsPerFloor = 6): { start: number; end: number } {
  const start = floor * roomsPerFloor;
  const end = start + roomsPerFloor - 1;
  return { start, end };
}

export type FloorBoundary = {
  floorNumber: number;
  floorLabel: string;
  shortLabel: string;
  startIndex: number;
  endIndex: number;
};

/** Real PG floor bands from grouped rooms (structural constraint layer). */
export function buildFloorBoundaries(floorGroups: FloorGroup[]): FloorBoundary[] {
  let cursor = 0;
  return floorGroups.map((group) => {
    const startIndex = cursor;
    const endIndex = cursor + group.rooms.length - 1;
    cursor += group.rooms.length;
    return {
      floorNumber: group.floorNumber,
      floorLabel: group.floorLabel,
      shortLabel: group.shortLabel,
      startIndex,
      endIndex,
    };
  });
}

export function getFloorBoundaryAtIndex(
  index: number,
  boundaries: FloorBoundary[],
): FloorBoundary | null {
  if (boundaries.length === 0 || index < 0) return null;
  return (
    boundaries.find((b) => index >= b.startIndex && index <= b.endIndex) ??
    boundaries[boundaries.length - 1] ??
    null
  );
}

/** Fractional center index from scroll physics — continuous, not snapped. */
export function fractionalActiveIndex(
  scrollOffset: number,
  viewportHeight: number,
  itemHeight: number,
  topPadding = 0,
): number {
  const centerY = scrollOffset + viewportHeight / 2 - topPadding;
  return centerY / itemHeight;
}

export function clampDistance(distance: number, max = 4): number {
  return Math.max(-max, Math.min(max, distance));
}
