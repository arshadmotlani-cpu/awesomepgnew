/**
 * Pure aggregation — PropertyProjector composes Wave 1 engine snapshots only.
 */

import type {
  BedBrainSnapshot,
  BookingLedgerSnapshot,
  DerivationRef,
  KpiStripSnapshot,
  PropertyOsIndexSnapshot,
  RoomOsSharedSnapshot,
} from '@/src/roomOs/types';
import type { PropertyInventory } from '@/src/roomOs/projectors/property/loadPropertyInventory';

export const WORK_QUEUE_NOT_MATERIALIZED_HASH = 'work_queue:not_materialized_v1';

export function countOccupiedBeds(bedBrains: BedBrainSnapshot[]): number {
  return bedBrains.filter((bed) => {
    const status = bed.bookingContext?.residencyStatus;
    return status === 'active' || status === 'vacating';
  }).length;
}

export function formatRoomOccupancySummary(bedBrains: BedBrainSnapshot[]): string {
  if (bedBrains.length === 0) return '0/0 beds';
  return `${countOccupiedBeds(bedBrains)}/${bedBrains.length} beds`;
}

export function aggregateElectricityProgress(roomShared: RoomOsSharedSnapshot[]): PropertyOsIndexSnapshot['electricityProgress'] {
  let complete = 0;
  let incomplete = 0;
  let blocked = 0;
  for (const room of roomShared) {
    if (room.electricityStatus === 'complete') complete += 1;
    else if (room.electricityStatus === 'blocked') blocked += 1;
    else incomplete += 1;
  }
  return { complete, incomplete, blocked };
}

export function aggregateKpiStrip(input: {
  pgId: string;
  billingMonth: string;
  computedAt: string;
  ledgers: BookingLedgerSnapshot[];
  roomShared: RoomOsSharedSnapshot[];
  bedBrains: BedBrainSnapshot[];
}): KpiStripSnapshot {
  return {
    pgId: input.pgId,
    billingMonth: input.billingMonth,
    proofsPending: input.ledgers.filter((ledger) => ledger.paymentState === 'proof_pending').length,
    overdueRent: input.ledgers.filter((ledger) => ledger.rent.status === 'overdue').length,
    rentDueToday: input.ledgers.filter((ledger) => ledger.rent.status === 'outstanding').length,
    electricityIncomplete: input.roomShared.filter((room) => room.electricityStatus !== 'complete').length,
    moveOutsPending: input.bedBrains.filter(
      (bed) => bed.bookingContext?.residencyStatus === 'vacating',
    ).length,
    computedAt: input.computedAt,
  };
}

export function buildRoomIndexEntries(input: {
  inventory: PropertyInventory;
  bedBrainsByRoomId: Map<string, BedBrainSnapshot[]>;
  roomSharedByRoomId: Map<string, RoomOsSharedSnapshot>;
}): PropertyOsIndexSnapshot['roomIndex'] {
  return input.inventory.rooms.map((room) => {
    const shared = input.roomSharedByRoomId.get(room.roomId);
    return {
      roomId: room.roomId,
      label: room.roomNumber,
      occupancySummary: formatRoomOccupancySummary(input.bedBrainsByRoomId.get(room.roomId) ?? []),
      electricityStatus: shared?.electricityStatus ?? 'unknown',
      electricityStatusReason: shared?.electricityStatusReason,
    };
  });
}

export function buildWorkQueueProjectionSource(input: {
  bedBrains: BedBrainSnapshot[];
  ledgers: BookingLedgerSnapshot[];
}): PropertyOsIndexSnapshot['workQueueProjection'] {
  return {
    bookings: input.ledgers.map((ledger) => ({
      bookingId: ledger.bookingId,
      bookingCode: ledger.bookingCode,
      paymentState: ledger.paymentState,
      paymentStateReason: ledger.paymentStateReason,
      rentStatus: ledger.rent.status,
    })),
    vacatingBeds: input.bedBrains.flatMap((bed) => {
      if (bed.bookingContext?.residencyStatus !== 'vacating') return [];
      return [
        {
          bedId: bed.bedId,
          roomId: bed.roomId,
          bookingId: bed.bookingContext.bookingId,
        },
      ];
    }),
  };
}

export function emptyWorkQueueSummary(
  computedAt: string,
): PropertyOsIndexSnapshot['workQueueSummary'] {
  return {
    totalItems: 0,
    bucketCounts: {},
    contentHash: WORK_QUEUE_NOT_MATERIALIZED_HASH,
    computedAt,
  };
}

/** Merge engine derivation refs + PropertyProjector assembly ref (Wave 4). */
export function collectPropertyDerivationRefs(input: {
  pgId: string;
  billingMonth: string;
  asOf: string;
  bedBrains: BedBrainSnapshot[];
  roomShared: RoomOsSharedSnapshot[];
  ledgers: BookingLedgerSnapshot[];
  computedAt: string;
}): DerivationRef[] {
  const refs: DerivationRef[] = [];

  for (const bed of input.bedBrains) {
    if (bed.bookingContext?.derivationRefs) {
      refs.push(...bed.bookingContext.derivationRefs);
    }
  }
  for (const room of input.roomShared) {
    refs.push(...room.derivationRefs);
  }
  for (const ledger of input.ledgers) {
    refs.push(...ledger.derivationRefs);
  }

  refs.push({
    stepId: 'property_index.assemble',
    engine: 'PropertyProjector',
    inputDigest: `pg:${input.pgId}:month:${input.billingMonth}:asOf:${input.asOf}`,
    outputDigest: `beds:${input.bedBrains.length}:rooms:${input.roomShared.length}:ledgers:${input.ledgers.length}`,
  });

  return refs;
}

export type AssemblePropertyIndexInput = {
  pgId: string;
  billingMonth: string;
  asOf: string;
  computedAt: string;
  inventory: PropertyInventory;
  bedBrains: BedBrainSnapshot[];
  roomShared: RoomOsSharedSnapshot[];
  ledgers: BookingLedgerSnapshot[];
  workQueueSummary?: PropertyOsIndexSnapshot['workQueueSummary'];
};

/** Deterministic property index assembly from pre-loaded engine snapshots. */
export function assemblePropertyOsIndex(input: AssemblePropertyIndexInput): PropertyOsIndexSnapshot {
  const bedBrainsByRoomId = new Map<string, BedBrainSnapshot[]>();
  for (const bed of input.bedBrains) {
    const list = bedBrainsByRoomId.get(bed.roomId) ?? [];
    list.push(bed);
    bedBrainsByRoomId.set(bed.roomId, list);
  }

  const roomSharedByRoomId = new Map(input.roomShared.map((room) => [room.roomId, room]));

  const derivationRefs = collectPropertyDerivationRefs({
    pgId: input.pgId,
    billingMonth: input.billingMonth,
    asOf: input.asOf,
    bedBrains: input.bedBrains,
    roomShared: input.roomShared,
    ledgers: input.ledgers,
    computedAt: input.computedAt,
  });

  return {
    pgId: input.pgId,
    billingMonth: input.billingMonth,
    asOf: input.asOf,
    kpiStrip: aggregateKpiStrip({
      pgId: input.pgId,
      billingMonth: input.billingMonth,
      computedAt: input.computedAt,
      ledgers: input.ledgers,
      roomShared: input.roomShared,
      bedBrains: input.bedBrains,
    }),
    workQueueSummary: input.workQueueSummary ?? emptyWorkQueueSummary(input.computedAt),
    roomIndex: buildRoomIndexEntries({
      inventory: input.inventory,
      bedBrainsByRoomId,
      roomSharedByRoomId,
    }),
    electricityProgress: aggregateElectricityProgress(input.roomShared),
    workQueueProjection: buildWorkQueueProjectionSource({
      bedBrains: input.bedBrains,
      ledgers: input.ledgers,
    }),
    computedAt: input.computedAt,
    snapshotVersion: 1,
    derivationRefs,
  };
}
