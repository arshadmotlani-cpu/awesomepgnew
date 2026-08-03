/**
 * Format Room OS domain events as human-readable timeline entries — Layer B.
 */

import { createHash } from 'node:crypto';
import type { RoomOsEventType } from '@/src/roomOs/events/catalog';
import type { TimelineEntry } from '@/src/roomOs/timeline/types';

export type OutboxEventRow = {
  id: string;
  eventId: string;
  streamType: string;
  streamId: string;
  eventType: string;
  occurredAt: Date;
  rulesEffectivePackId: string;
  payload: Record<string, unknown>;
  sourceRef: string;
};

const EVENT_COPY: Record<RoomOsEventType, { title: string; summary: (payload: Record<string, unknown>) => string }> = {
  'occupancy.bed_assigned': {
    title: 'Bed assigned',
    summary: (payload) => `Resident assigned to bed ${String(payload.bedId ?? 'unknown')}.`,
  },
  'occupancy.bed_vacated': {
    title: 'Bed vacated',
    summary: (payload) => `Bed ${String(payload.bedId ?? 'unknown')} marked vacated.`,
  },
  'electricity.meter_reading_recorded': {
    title: 'Meter reading recorded',
    summary: (payload) => `Meter reading captured for room ${String(payload.roomId ?? 'unknown')}.`,
  },
  'electricity.bill_status_changed': {
    title: 'Electricity bill status changed',
    summary: (payload) => `Bill status updated to ${String(payload.status ?? 'unknown')}.`,
  },
  'ledger.rent_projection_updated': {
    title: 'Rent projection updated',
    summary: (payload) => `Rent projection refreshed for booking ${String(payload.bookingId ?? 'unknown')}.`,
  },
  'ledger.deposit_projection_updated': {
    title: 'Deposit projection updated',
    summary: (payload) => `Deposit projection refreshed for booking ${String(payload.bookingId ?? 'unknown')}.`,
  },
  'work_queue.rebuilt': {
    title: 'Work queue rebuilt',
    summary: (payload) => `Work queue materialized for billing month ${String(payload.billingMonth ?? 'unknown')}.`,
  },
  'property_index.rebuild_requested': {
    title: 'Property index rebuild requested',
    summary: (payload) => `Property index rebuild queued for billing month ${String(payload.billingMonth ?? 'unknown')}.`,
  },
  'property_index.materialized': {
    title: 'Property index materialized',
    summary: (payload) => `Property index snapshot persisted for ${String(payload.billingMonth ?? 'unknown')}.`,
  },
  'integrity.flag_raised': {
    title: 'Integrity flag raised',
    summary: (payload) => `Integrity check flagged ${String(payload.checkId ?? 'unknown')}.`,
  },
  'workflow.payment_proof.submitted': {
    title: 'Payment proof submitted for review',
    summary: (payload) =>
      `Payment proof ${String(payload.reviewKey ?? 'unknown')} marked under review.`,
  },
  'workflow.payment_proof.approved': {
    title: 'Payment proof approved',
    summary: (payload) => `Payment proof ${String(payload.reviewKey ?? 'unknown')} approved.`,
  },
  'workflow.payment_proof.rejected': {
    title: 'Payment proof rejected',
    summary: (payload) =>
      `Payment proof ${String(payload.reviewKey ?? 'unknown')} rejected (${String(payload.reasonCode ?? 'unknown')}).`,
  },
};

function payloadDigest(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

export function formatTimelineEntry(row: OutboxEventRow): TimelineEntry {
  const copy = EVENT_COPY[row.eventType as RoomOsEventType];
  const title = copy?.title ?? row.eventType.replace(/\./g, ' ');
  const summary = copy?.summary(row.payload) ?? `Event ${row.eventType} recorded.`;

  return {
    id: row.id,
    eventId: row.eventId,
    streamType: row.streamType,
    streamId: row.streamId,
    occurredAt: row.occurredAt.toISOString(),
    eventType: row.eventType,
    title,
    summary,
    rulesEffectivePackId: row.rulesEffectivePackId,
    payloadDigest: payloadDigest(row.payload),
    sourceRef: row.sourceRef,
    metadata: {
      billingMonth: row.payload.billingMonth,
      pgId: row.payload.pgId,
    },
  };
}

export function formatTimelineEntries(rows: OutboxEventRow[]): TimelineEntry[] {
  return rows.map(formatTimelineEntry);
}
