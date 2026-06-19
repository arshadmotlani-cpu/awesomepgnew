export type TheaterNavRoom = {
  roomId: string;
  floorNumber: number;
};

/** Rooms ordered floor-by-floor for carousel navigation. */
export function orderRoomsForTheater<T extends TheaterNavRoom>(rooms: T[]): T[] {
  return [...rooms].sort((a, b) => {
    if (a.floorNumber !== b.floorNumber) return a.floorNumber - b.floorNumber;
    return a.roomId.localeCompare(b.roomId);
  });
}

export function nextRoomIndex(current: number, total: number): number {
  if (total <= 0) return 0;
  return (current + 1) % total;
}

export function prevRoomIndex(current: number, total: number): number {
  if (total <= 0) return 0;
  return (current - 1 + total) % total;
}

export function firstRoomIndexOnFloor<T extends TheaterNavRoom>(
  rooms: T[],
  floorNumber: number,
): number {
  const idx = rooms.findIndex((r) => r.floorNumber === floorNumber);
  return idx >= 0 ? idx : 0;
}

export function uniqueFloors<T extends TheaterNavRoom>(rooms: T[]): number[] {
  return [...new Set(rooms.map((r) => r.floorNumber))].sort((a, b) => a - b);
}
