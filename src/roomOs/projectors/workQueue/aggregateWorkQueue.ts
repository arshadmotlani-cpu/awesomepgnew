/**
 * Pure aggregation — WorkQueueProjector composes queue items from PropertyOsIndexSnapshot only.
 */

import { createHash } from 'node:crypto';
import type {
  PropertyOsIndexSnapshot,
  WorkQueueBucket,
  WorkQueueItem,
  WorkQueueSnapshot,
} from '@/src/roomOs/types';

/** Matches rules catalog v1 `global.work_queue.proofs_first` bucket order. */
export const WORK_QUEUE_BUCKET_ORDER: readonly WorkQueueBucket[] = [
  'proofs',
  'overdue_rent',
  'rent_today',
  'electricity',
  'move_out',
  'day_close',
];

export function workQueueItemId(
  bucket: WorkQueueBucket,
  entityType: WorkQueueItem['entityType'],
  entityId: string,
): string {
  return `${bucket}:${entityType}:${entityId}`;
}

export function bucketPriority(bucket: WorkQueueBucket): number {
  const index = WORK_QUEUE_BUCKET_ORDER.indexOf(bucket);
  return index >= 0 ? index : WORK_QUEUE_BUCKET_ORDER.length;
}

export function buildWorkQueueItemsFromPropertyIndex(
  propertyIndex: PropertyOsIndexSnapshot,
): WorkQueueItem[] {
  const items: WorkQueueItem[] = [];
  const pgId = propertyIndex.pgId;

  for (const booking of propertyIndex.workQueueProjection.bookings) {
    if (booking.paymentState === 'proof_pending') {
      items.push({
        id: workQueueItemId('proofs', 'booking', booking.bookingId),
        bucket: 'proofs',
        priority: bucketPriority('proofs'),
        title: `Payment proof · ${booking.bookingCode}`,
        entityType: 'booking',
        entityId: booking.bookingId,
        pgId,
        bookingId: booking.bookingId,
        reasonCode: booking.paymentStateReason ?? booking.paymentState,
      });
    }
    if (booking.rentStatus === 'overdue') {
      items.push({
        id: workQueueItemId('overdue_rent', 'booking', booking.bookingId),
        bucket: 'overdue_rent',
        priority: bucketPriority('overdue_rent'),
        title: `Overdue rent · ${booking.bookingCode}`,
        entityType: 'booking',
        entityId: booking.bookingId,
        pgId,
        bookingId: booking.bookingId,
        reasonCode: booking.rentStatus,
      });
    }
    if (booking.rentStatus === 'outstanding') {
      items.push({
        id: workQueueItemId('rent_today', 'booking', booking.bookingId),
        bucket: 'rent_today',
        priority: bucketPriority('rent_today'),
        title: `Rent due · ${booking.bookingCode}`,
        entityType: 'booking',
        entityId: booking.bookingId,
        pgId,
        bookingId: booking.bookingId,
        reasonCode: booking.rentStatus,
      });
    }
  }

  for (const room of propertyIndex.roomIndex) {
    if (room.electricityStatus === 'complete') continue;
    items.push({
      id: workQueueItemId('electricity', 'room', room.roomId),
      bucket: 'electricity',
      priority: bucketPriority('electricity'),
      title: `Electricity · ${room.label}`,
      entityType: 'room',
      entityId: room.roomId,
      pgId,
      roomId: room.roomId,
      reasonCode: room.electricityStatusReason ?? room.electricityStatus,
    });
  }

  for (const bed of propertyIndex.workQueueProjection.vacatingBeds) {
    items.push({
      id: workQueueItemId('move_out', 'bed', bed.bedId),
      bucket: 'move_out',
      priority: bucketPriority('move_out'),
      title: `Move out · Bed ${bed.bedId.slice(0, 8)}`,
      entityType: 'bed',
      entityId: bed.bedId,
      pgId,
      roomId: bed.roomId,
      bedId: bed.bedId,
      bookingId: bed.bookingId,
      reasonCode: 'vacating',
    });
  }

  return items;
}

export function sortWorkQueueItems(items: WorkQueueItem[]): WorkQueueItem[] {
  return [...items].sort((a, b) => {
    const bucketDiff = bucketPriority(a.bucket) - bucketPriority(b.bucket);
    if (bucketDiff !== 0) return bucketDiff;
    const idDiff = a.id.localeCompare(b.id);
    if (idDiff !== 0) return idDiff;
    return a.entityId.localeCompare(b.entityId);
  });
}

export function computeWorkQueueContentHash(items: WorkQueueItem[]): string {
  const canonical = sortWorkQueueItems(items).map((item) => ({
    id: item.id,
    bucket: item.bucket,
    entityType: item.entityType,
    entityId: item.entityId,
    reasonCode: item.reasonCode ?? null,
  }));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function summarizeWorkQueueSnapshot(
  snapshot: WorkQueueSnapshot,
): PropertyOsIndexSnapshot['workQueueSummary'] {
  const bucketCounts: Partial<Record<WorkQueueBucket, number>> = {};
  for (const item of snapshot.items) {
    bucketCounts[item.bucket] = (bucketCounts[item.bucket] ?? 0) + 1;
  }
  return {
    totalItems: snapshot.items.length,
    bucketCounts,
    contentHash: snapshot.contentHash,
    computedAt: snapshot.computedAt,
  };
}

/** Deterministic work queue assembly from Property OS snapshot only. */
export function assembleWorkQueueSnapshot(input: {
  propertyIndex: PropertyOsIndexSnapshot;
  computedAt?: string;
}): WorkQueueSnapshot {
  const items = sortWorkQueueItems(buildWorkQueueItemsFromPropertyIndex(input.propertyIndex));
  const computedAt = input.computedAt ?? input.propertyIndex.computedAt;

  return {
    pgId: input.propertyIndex.pgId,
    billingMonth: input.propertyIndex.billingMonth,
    items,
    computedAt,
    contentHash: computeWorkQueueContentHash(items),
    derivationRefs: [
      {
        stepId: 'work_queue.project',
        engine: 'WorkQueueProjector',
        inputDigest: `property:${input.propertyIndex.pgId}:hash:${input.propertyIndex.workQueueSummary.contentHash}`,
        outputDigest: `items:${items.length}:${computeWorkQueueContentHash(items).slice(0, 16)}`,
      },
    ],
  };
}
