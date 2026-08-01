import { validateRoomIntegrity } from '@/src/lib/roomIntegrity/validateRoomIntegrity';
import type { RoomIntegrityIssue, RoomIntegritySnapshot } from '@/src/lib/roomIntegrity/types';

export type RoomIntegrityPreviewState = {
  storedCapacity: number;
  physicalBeds: number;
  bookableBeds: number;
  blockedBeds: number;
  maintenanceBeds: number;
  occupiedBeds: number;
  roomTypeName: string;
};

export function buildIntegrityPreview(
  state: RoomIntegrityPreviewState,
): { ok: true } | { ok: false; issues: RoomIntegrityIssue[] } {
  const snapshot: RoomIntegritySnapshot = {
    roomId: 'preview',
    pgId: 'preview',
    pgName: '',
    roomNumber: '',
    ...state,
  };
  const issues = validateRoomIntegrity(snapshot);
  if (issues.length === 0) return { ok: true };
  return { ok: false, issues };
}

export function previewFromBeds(input: {
  roomTypeName: string;
  targetBedCount: number;
  beds: Array<{ status: 'available' | 'maintenance' | 'blocked'; occupied?: boolean }>;
  occupiedBeds?: number;
}): RoomIntegrityPreviewState {
  const physicalBeds = input.targetBedCount;
  let bookableBeds = 0;
  let blockedBeds = 0;
  let maintenanceBeds = 0;

  for (const bed of input.beds.slice(0, physicalBeds)) {
    if (bed.status === 'available') bookableBeds += 1;
    if (bed.status === 'blocked') blockedBeds += 1;
    if (bed.status === 'maintenance') maintenanceBeds += 1;
  }

  for (let i = input.beds.length; i < physicalBeds; i += 1) {
    bookableBeds += 1;
  }

  const occupiedBeds =
    input.occupiedBeds ??
    input.beds.filter((b) => b.occupied).length;

  return {
    storedCapacity: physicalBeds,
    physicalBeds,
    bookableBeds,
    blockedBeds,
    maintenanceBeds,
    occupiedBeds,
    roomTypeName: input.roomTypeName,
  };
}
