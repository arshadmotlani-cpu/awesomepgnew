/**
 * Pure room capacity helpers — safe for client components.
 * Active (non-archived) bed count is the single source of truth.
 */
import { sharingTypeName } from '@/src/lib/roomSharing';

const GENERIC_SHARING_NAME = /^\d+\s*Sharing(?:\s*\(single\))?$/i;

export function isGenericSharingRoomTypeName(name: string): boolean {
  return GENERIC_SHARING_NAME.test(name.trim());
}

export function roomCapacityFromActiveBedCount(activeBedCount: number): number {
  return Math.max(0, Math.floor(activeBedCount));
}

export function sharingLabelFromActiveBedCount(activeBedCount: number): string {
  const n = roomCapacityFromActiveBedCount(activeBedCount);
  if (n <= 0) return 'No beds';
  return sharingTypeName(n);
}

export function resolveRoomTypeNameForCapacity(
  currentName: string,
  activeBedCount: number,
): string {
  if (!isGenericSharingRoomTypeName(currentName)) return currentName.trim();
  const n = roomCapacityFromActiveBedCount(activeBedCount);
  return n > 0 ? sharingTypeName(n) : currentName.trim();
}

export function resolveEffectiveRoomCapacity(input: {
  activeBedCount: number;
  storedCapacity?: number | null;
}): number {
  const fromBeds = roomCapacityFromActiveBedCount(input.activeBedCount);
  if (fromBeds > 0) return fromBeds;
  return Math.max(1, Math.floor(input.storedCapacity ?? 1));
}

/**
 * Configured roommate slots for a resident profile:
 * sharing capacity minus the resident's own bed (never count self as a roommate).
 */
export function roommateCountFromRoomCapacity(roomCapacity: number): number {
  return Math.max(0, roomCapacityFromActiveBedCount(roomCapacity) - 1);
}

/** Resident profile "Room sharing" label from configured room capacity. */
export function residentProfileRoomSharingLabel(roomCapacity: number): string {
  const capacity = roomCapacityFromActiveBedCount(roomCapacity);
  if (capacity <= 1) return 'Private room';
  const roommates = roommateCountFromRoomCapacity(capacity);
  return `${capacity}-sharing (${roommates} roommate${roommates === 1 ? '' : 's'})`;
}
