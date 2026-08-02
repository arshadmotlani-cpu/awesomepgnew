/**
 * PropertyProjector — materializes PropertyOsIndexSnapshot from Wave 1 engines.
 */

import { buildBookingLedgerSnapshot } from '@/src/roomOs/engines/ledger';
import { buildRoomSharedSnapshot } from '@/src/roomOs/engines/electricity';
import { buildBedBrainSnapshot } from '@/src/roomOs/engines/occupancy';
import { assemblePropertyOsIndex } from '@/src/roomOs/projectors/property/aggregatePropertyIndex';
import {
  loadPropertyInventory,
  propertyExists,
} from '@/src/roomOs/projectors/property/loadPropertyInventory';
import {
  projectWorkQueueSnapshot,
  summarizeWorkQueueSnapshot,
} from '@/src/roomOs/projectors/workQueue';
import type { PropertyOsIndexSnapshot, WorkQueueSnapshot } from '@/src/roomOs/types';
import { todayString } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';

export type PropertyOsProjectionBundle = {
  propertyIndex: PropertyOsIndexSnapshot;
  workQueue: WorkQueueSnapshot;
};

/** Load engine snapshots and materialize Property OS + Work Queue projections. */
export async function projectPropertyOsBundle(input: {
  pgId: string;
  billingMonth: string;
  asOf?: string;
}): Promise<PropertyOsProjectionBundle | null> {
  const exists = await propertyExists(input.pgId);
  if (!exists) return null;

  const asOf = input.asOf ?? todayString();
  const billingMonth = firstOfMonth(input.billingMonth);
  const inventory = await loadPropertyInventory(input.pgId);

  const bedBrains: Awaited<ReturnType<typeof buildBedBrainSnapshot>>[] = [];
  const roomShared: NonNullable<Awaited<ReturnType<typeof buildRoomSharedSnapshot>>>[] = [];
  const ledgersByBookingId = new Map<
    string,
    NonNullable<Awaited<ReturnType<typeof buildBookingLedgerSnapshot>>>
  >();

  for (const room of inventory.rooms) {
    const shared = await buildRoomSharedSnapshot({
      roomId: room.roomId,
      billingMonth,
      asOf,
    });
    if (shared) roomShared.push(shared);

    for (const bedId of room.bedIds) {
      const bed = await buildBedBrainSnapshot({ bedId, asOf });
      if (!bed) continue;
      bedBrains.push(bed);

      const bookingId = bed.bookingContext?.bookingId;
      if (!bookingId || ledgersByBookingId.has(bookingId)) continue;

      const ledger = await buildBookingLedgerSnapshot({ bookingId, asOf });
      if (ledger) ledgersByBookingId.set(bookingId, ledger);
    }
  }

  const computedAt = new Date().toISOString();
  const ledgers = [...ledgersByBookingId.values()];
  const propertyIndexBase = assemblePropertyOsIndex({
    pgId: input.pgId,
    billingMonth,
    asOf,
    computedAt,
    inventory,
    bedBrains,
    roomShared,
    ledgers,
  });

  const workQueue = projectWorkQueueSnapshot({
    propertyIndex: propertyIndexBase,
    computedAt,
  });

  return {
    propertyIndex: {
      ...propertyIndexBase,
      workQueueSummary: summarizeWorkQueueSnapshot(workQueue),
    },
    workQueue,
  };
}

/** Project one property index by composing Bed Brain, Room Shared, and Ledger engines. */
export async function projectPropertyOsIndex(input: {
  pgId: string;
  billingMonth: string;
  asOf?: string;
}): Promise<PropertyOsIndexSnapshot | null> {
  const bundle = await projectPropertyOsBundle(input);
  return bundle?.propertyIndex ?? null;
}
