import type { PgSpineRoom, FloorGroup } from '@/src/lib/roomWorld/pgSpineRoom';

export function floorShortLabel(floorNumber: number, floorLabel: string): string {
  if (floorNumber === 0 || /\bground\b/i.test(floorLabel)) return 'G';
  if (/^floor\s*(\d+)/i.test(floorLabel)) {
    const m = floorLabel.match(/^floor\s*(\d+)/i);
    if (m) return `${m[1]}F`;
  }
  return `${floorNumber}F`;
}

export function groupRoomsByFloor(rooms: PgSpineRoom[]): FloorGroup[] {
  const map = new Map<number, FloorGroup>();
  for (const room of rooms) {
    const existing = map.get(room.floorNumber);
    if (existing) {
      existing.rooms.push(room);
    } else {
      map.set(room.floorNumber, {
        floorNumber: room.floorNumber,
        floorLabel: room.floorLabel,
        shortLabel: floorShortLabel(room.floorNumber, room.floorLabel),
        rooms: [room],
      });
    }
  }
  return [...map.values()].sort((a, b) => a.floorNumber - b.floorNumber);
}

/** Flat ordered list for spine scroll indices. */
export function flattenFloorGroups(groups: FloorGroup[]): PgSpineRoom[] {
  return groups.flatMap((g) => g.rooms);
}

/** Spine visual offset clamped for 3D transforms. */
export function spineVisualOffset(index: number, activeIndex: number): number {
  const raw = index - activeIndex;
  return Math.max(-3, Math.min(3, raw));
}

export type SpineTransformStyle = {
  rotateX: number;
  scale: number;
  translateZ: number;
  opacity: number;
  zIndex: number;
};

/** 3D depth styling from offset — center = active room. */
export function spineTransformForOffset(offset: number, reducedMotion: boolean): SpineTransformStyle {
  if (reducedMotion || offset === 0) {
    return {
      rotateX: 0,
      scale: offset === 0 ? 1 : 0.94,
      translateZ: 0,
      opacity: offset === 0 ? 1 : 0.85,
      zIndex: offset === 0 ? 10 : 1,
    };
  }

  if (offset < 0) {
    const depth = Math.min(3, Math.abs(offset));
    return {
      rotateX: -25 * (depth / 3),
      scale: 1 - depth * 0.06,
      translateZ: -depth * 28,
      opacity: 1 - depth * 0.12,
      zIndex: 10 - depth,
    };
  }

  const depth = Math.min(3, offset);
  return {
    rotateX: 25 * (depth / 3),
    scale: 1 - depth * 0.06,
    translateZ: depth * 28,
    opacity: 1 - depth * 0.12,
    zIndex: 10 - depth,
  };
}

export function roomAvailabilityLabel(room: PgSpineRoom): string {
  if (room.totalBeds === 0) return 'No beds';
  if (room.availableBeds === 0) return 'Full';
  if (room.availableBeds === room.totalBeds) return 'Open';
  return `${room.availableBeds} free`;
}

export function occupancyRatio(room: PgSpineRoom): number {
  if (room.totalBeds <= 0) return 0;
  return Math.max(0, Math.min(1, room.availableBeds / room.totalBeds));
}
