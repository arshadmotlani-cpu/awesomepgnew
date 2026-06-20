import type { CustomerRoomCard } from '@/src/db/queries/customer';

/** Room-type price band from listRoomsForPg rows (min/max monthlyRatePaise per roomType). */
export type PgRoomTypeSummary = {
  roomType: string;
  minPricePaise: number;
  maxPricePaise: number;
};

export function buildPgRoomTypeSummaries(rooms: CustomerRoomCard[]): PgRoomTypeSummary[] {
  const pricesByType = new Map<string, number[]>();

  for (const room of rooms) {
    if (room.monthlyRatePaise <= 0) continue;
    const list = pricesByType.get(room.roomType) ?? [];
    list.push(room.monthlyRatePaise);
    pricesByType.set(room.roomType, list);
  }

  return Array.from(pricesByType.entries())
    .map(([roomType, prices]) => ({
      roomType,
      minPricePaise: Math.min(...prices),
      maxPricePaise: Math.max(...prices),
    }))
    .sort((a, b) => a.roomType.localeCompare(b.roomType));
}

/** Customer PG UI — single vs shared filter keys aligned with roomType names from DB. */
export function isSingleRoomType(roomType: string, capacity: number): boolean {
  const t = roomType.toLowerCase();
  if (t.includes('single') || t.includes('private')) return true;
  if (t.includes('shared') || t.includes('dorm') || t.includes('double') || t.includes('triple'))
    return false;
  return capacity <= 1;
}

export function pgRoomTypeFilterKey(roomType: string, capacity: number): 'single' | 'shared' {
  return isSingleRoomType(roomType, capacity) ? 'single' : 'shared';
}

export const PG_ROOM_TYPE_LABEL: Record<'single' | 'shared', string> = {
  single: 'Single Room',
  shared: 'Shared Room',
};

/** Collapse API roomType rows into Single / Shared price bands (from API monthly rates only). */
export function buildSingleSharedSummaries(rooms: CustomerRoomCard[]): PgRoomTypeSummary[] {
  const bands: Record<'single' | 'shared', number[]> = { single: [], shared: [] };

  for (const room of rooms) {
    if (room.monthlyRatePaise <= 0) continue;
    bands[pgRoomTypeFilterKey(room.roomType, room.capacity)].push(room.monthlyRatePaise);
  }

  return (['single', 'shared'] as const)
    .map((key) => {
      const prices = bands[key];
      if (prices.length === 0) return null;
      return {
        roomType: key,
        minPricePaise: Math.min(...prices),
        maxPricePaise: Math.max(...prices),
      };
    })
    .filter(Boolean) as PgRoomTypeSummary[];
}
