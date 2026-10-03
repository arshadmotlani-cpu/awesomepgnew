/** Pure contracts for electricity billing room inventory (no DB). */

/** Facility AC must not exclude a room from electricity billing inventory. */
export function electricityBillingInventoryMustNotFilterByAc(querySource: string): boolean {
  return !/eq\s*\(\s*roomTypes\.hasAc\s*,\s*true\s*\)/.test(querySource);
}

export function electricityBillingInventoryIncludesNonArchivedRooms(querySource: string): boolean {
  return /archivedAt\s*IS\s*NULL|archived_at\s*IS\s*NULL/.test(querySource);
}
