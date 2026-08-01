/**
 * Pure room integrity rules — client-safe.
 *
 * Invariant (unless beds are intentionally blocked/disabled):
 *   Capacity = Physical beds = Bookable beds
 *
 * When blocked or maintenance beds exist:
 *   Physical beds = Bookable + Blocked + Maintenance
 *   Capacity = Physical beds
 */
import { isGenericSharingRoomTypeName } from '@/src/lib/roomCapacitySsot';
import { parseSharingCount } from '@/src/lib/roomSharing';
import type { RoomIntegrityIssue, RoomIntegritySnapshot } from '@/src/lib/roomIntegrity/types';

export function validateRoomIntegrity(snapshot: RoomIntegritySnapshot): RoomIntegrityIssue[] {
  const issues: RoomIntegrityIssue[] = [];
  const {
    storedCapacity,
    physicalBeds,
    bookableBeds,
    blockedBeds,
    maintenanceBeds,
    occupiedBeds,
    roomTypeName,
  } = snapshot;

  if (storedCapacity !== physicalBeds) {
    issues.push({
      code: 'capacity_physical_mismatch',
      message: `Capacity (${storedCapacity}) ≠ physical beds (${physicalBeds})`,
    });
  }

  const accountedBeds = bookableBeds + blockedBeds + maintenanceBeds;
  if (accountedBeds !== physicalBeds) {
    issues.push({
      code: 'bookable_physical_mismatch',
      message: `Bookable (${bookableBeds}) + blocked (${blockedBeds}) + maintenance (${maintenanceBeds}) ≠ physical beds (${physicalBeds})`,
    });
  }

  if (blockedBeds + maintenanceBeds === 0 && bookableBeds !== physicalBeds) {
    issues.push({
      code: 'bookable_physical_mismatch',
      message: `Bookable beds (${bookableBeds}) ≠ physical beds (${physicalBeds}) — no blocked or disabled beds`,
    });
  }

  if (occupiedBeds > storedCapacity) {
    issues.push({
      code: 'occupied_exceeds_capacity',
      message: `Occupied (${occupiedBeds}) exceeds capacity (${storedCapacity})`,
    });
  }

  if (occupiedBeds > physicalBeds) {
    issues.push({
      code: 'occupied_exceeds_physical',
      message: `Occupied (${occupiedBeds}) exceeds physical beds (${physicalBeds})`,
    });
  }

  if (isGenericSharingRoomTypeName(roomTypeName)) {
    const labelCap = parseSharingCount(roomTypeName);
    if (labelCap != null && labelCap !== physicalBeds) {
      issues.push({
        code: 'sharing_label_mismatch',
        message: `Room type "${roomTypeName}" ≠ physical bed count (${physicalBeds})`,
      });
    }
  }

  return issues;
}

export function roomIntegrityResult(snapshot: RoomIntegritySnapshot) {
  const issues = validateRoomIntegrity(snapshot);
  return {
    ...snapshot,
    issues,
    hasMismatch: issues.length > 0,
  };
}

/** Validate a proposed inventory state before persisting (add/remove/status change). */
export function validateProposedRoomIntegrity(
  proposed: Pick<
    RoomIntegritySnapshot,
    | 'storedCapacity'
    | 'physicalBeds'
    | 'bookableBeds'
    | 'blockedBeds'
    | 'maintenanceBeds'
    | 'occupiedBeds'
    | 'roomTypeName'
  >,
): { ok: true } | { ok: false; error: string } {
  const issues = validateRoomIntegrity({
    roomId: 'proposed',
    pgId: 'proposed',
    pgName: '',
    roomNumber: '',
    ...proposed,
  });
  if (issues.length === 0) return { ok: true };
  return { ok: false, error: issues.map((i) => i.message).join(' ') };
}

export function assertProposedRoomIntegrity(
  proposed: Parameters<typeof validateProposedRoomIntegrity>[0],
): void {
  const result = validateProposedRoomIntegrity(proposed);
  if (!result.ok) {
    throw new Error(`Room configuration invalid: ${result.error}`);
  }
}

/** Reject custom sharing labels that disagree with bed count. */
export function assertRoomTypeNameMatchesBedCount(
  roomTypeName: string,
  physicalBeds: number,
): void {
  if (!isGenericSharingRoomTypeName(roomTypeName)) return;
  const labelCap = parseSharingCount(roomTypeName);
  if (labelCap != null && labelCap !== physicalBeds) {
    throw new Error(
      `Room type "${roomTypeName}" does not match ${physicalBeds} physical bed${physicalBeds === 1 ? '' : 's'}. Update beds or choose a custom room name.`,
    );
  }
}
