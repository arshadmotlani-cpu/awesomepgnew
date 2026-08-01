import {
  resolveRoomTypeNameForCapacity,
  roomCapacityFromActiveBedCount,
} from '@/src/lib/roomCapacitySsot';
import { MAX_ROOM_BEDS } from '@/src/lib/roomSharing';
import type { RoomIntegritySnapshot } from '@/src/lib/roomIntegrity/types';
import {
  assertProposedRoomIntegrity,
} from '@/src/lib/roomIntegrity/validateRoomIntegrity';

type BedStatus = 'available' | 'maintenance' | 'blocked';

function adjustStatusCounts(
  counts: Pick<RoomIntegritySnapshot, 'bookableBeds' | 'blockedBeds' | 'maintenanceBeds'>,
  from: BedStatus,
  to: BedStatus,
): Pick<RoomIntegritySnapshot, 'bookableBeds' | 'blockedBeds' | 'maintenanceBeds'> {
  let { bookableBeds, blockedBeds, maintenanceBeds } = counts;

  const dec = (status: BedStatus) => {
    if (status === 'available') bookableBeds = Math.max(0, bookableBeds - 1);
    if (status === 'blocked') blockedBeds = Math.max(0, blockedBeds - 1);
    if (status === 'maintenance') maintenanceBeds = Math.max(0, maintenanceBeds - 1);
  };
  const inc = (status: BedStatus) => {
    if (status === 'available') bookableBeds += 1;
    if (status === 'blocked') blockedBeds += 1;
    if (status === 'maintenance') maintenanceBeds += 1;
  };

  if (from !== to) {
    dec(from);
    inc(to);
  }

  return { bookableBeds, blockedBeds, maintenanceBeds };
}

/** Validate inventory after changing one bed's status. */
export function assertBedStatusChangeAllowed(
  room: RoomIntegritySnapshot,
  fromStatus: BedStatus,
  toStatus: BedStatus,
): void {
  const adjusted = adjustStatusCounts(room, fromStatus, toStatus);
  assertProposedRoomIntegrity({
    storedCapacity: room.storedCapacity,
    physicalBeds: room.physicalBeds,
    occupiedBeds: room.occupiedBeds,
    roomTypeName: room.roomTypeName,
    ...adjusted,
  });
}

/** Validate inventory after removing one physical bed. */
export function assertBedRemovalAllowed(
  room: RoomIntegritySnapshot,
  removedBedStatus: BedStatus,
): void {
  const newPhysical = room.physicalBeds - 1;
  if (room.occupiedBeds > newPhysical) {
    throw new Error(
      `Cannot remove bed — ${room.occupiedBeds} resident${room.occupiedBeds === 1 ? '' : 's'} occupy ${room.physicalBeds} bed${room.physicalBeds === 1 ? '' : 's'}.`,
    );
  }
  if (newPhysical === 0) return;

  let { bookableBeds, blockedBeds, maintenanceBeds } = room;
  if (removedBedStatus === 'available') bookableBeds = Math.max(0, bookableBeds - 1);
  else if (removedBedStatus === 'blocked') blockedBeds = Math.max(0, blockedBeds - 1);
  else if (removedBedStatus === 'maintenance') maintenanceBeds = Math.max(0, maintenanceBeds - 1);

  assertProposedRoomIntegrity({
    storedCapacity: Math.max(1, roomCapacityFromActiveBedCount(newPhysical)),
    physicalBeds: newPhysical,
    bookableBeds,
    blockedBeds,
    maintenanceBeds,
    occupiedBeds: room.occupiedBeds,
    roomTypeName: resolveRoomTypeNameForCapacity(room.roomTypeName, newPhysical),
  });
}

/** Validate inventory after adding beds to a room. */
export function assertBedAdditionAllowed(input: {
  currentPhysicalBeds: number;
  bedsToAdd: number;
  sharingCount: number;
  isNewRoom: boolean;
}): void {
  const newTotal = input.currentPhysicalBeds + input.bedsToAdd;
  if (newTotal > MAX_ROOM_BEDS) {
    throw new Error(`A room cannot have more than ${MAX_ROOM_BEDS} beds.`);
  }
  if (input.isNewRoom && input.sharingCount < newTotal) {
    throw new Error('Sharing type must be at least the number of beds being added.');
  }
  if (input.isNewRoom && input.sharingCount > MAX_ROOM_BEDS) {
    throw new Error(`Sharing type must be between 1 and ${MAX_ROOM_BEDS}.`);
  }
}

/** Block capacity reduction when active residents exceed the new target. */
export function assertCapacityReductionAllowed(
  occupiedBeds: number,
  currentPhysicalBeds: number,
  targetBedCount: number,
): void {
  if (targetBedCount >= currentPhysicalBeds) return;
  if (occupiedBeds > targetBedCount) {
    const needToMove = occupiedBeds - targetBedCount;
    throw new Error(
      `Cannot reduce room capacity. ${occupiedBeds} active resident${occupiedBeds === 1 ? '' : 's'} currently occupy this room. Vacate or move ${needToMove} resident${needToMove === 1 ? '' : 's'} first.`,
    );
  }
}
