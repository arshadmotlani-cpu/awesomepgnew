/**
 * Meter Timeline Service — single API for official room meter baseline.
 *
 * Invariant: only Workflow A (monthly bill finalize) may advance baseline.
 * Checkout readings record events without touching the monthly chain.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityBills, floors, meterLogs, rooms } from '@/src/db/schema';
import { formatDate } from '@/src/lib/dates';
import {
  resolveRoomPreviousMeterReading,
  type ResolvedRoomPreviousMeterReading,
} from '@/src/services/roomMeterReadingSsot';
import type { RoomPreviousMeterSource } from '@/src/lib/billing/roomMeterReadingSsot';

export type MeterTimelineEventType = 'monthly_finalize' | 'checkout' | 'checkin';

export type MeterTimelineBaseline = ResolvedRoomPreviousMeterReading;

export type RecordCheckoutReadingInput = {
  roomId: string;
  readingUnits: number;
  settlementId?: string;
  recordedByAdminId?: string;
  note?: string;
};

export type AdvanceBaselineInput = {
  roomId: string;
  billingMonth: string;
  currentReadingUnits: number;
  /** Must be set when called from electricity bill finalize. */
  electricityBillId: string;
};

export class MeterTimelineError extends Error {
  constructor(
    message: string,
    readonly code: 'baseline_regression' | 'unauthorized_advance' | 'invalid_reading',
  ) {
    super(message);
    this.name = 'MeterTimelineError';
  }
}

/** Read official previous reading for Workflow A (monthly split). */
export async function resolveOfficialPreviousReading(
  roomId: string,
): Promise<MeterTimelineBaseline> {
  return resolveRoomPreviousMeterReading(roomId);
}

/** Human-readable timeline source label for admin diagnostics. */
export function describeMeterBaselineSource(source: RoomPreviousMeterSource): string {
  switch (source) {
    case 'last_monthly_bill':
      return 'Last finalized monthly bill';
    case 'last_monthly_meter_log':
      return 'Bootstrap monthly meter log';
    case 'none':
      return 'No prior reading (starting at 0)';
    default:
      return source;
  }
}

/**
 * Record a checkout meter reading event.
 * Does NOT advance the monthly baseline chain.
 */
export async function recordCheckoutReading(input: RecordCheckoutReadingInput): Promise<void> {
  if (!Number.isFinite(input.readingUnits) || input.readingUnits < 0) {
    throw new MeterTimelineError('Invalid checkout reading units', 'invalid_reading');
  }

  const [roomRow] = await db
    .select({ pgId: floors.pgId })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(rooms.id, input.roomId))
    .limit(1);

  if (!roomRow) {
    throw new MeterTimelineError('Room not found for checkout reading', 'invalid_reading');
  }

  await db.insert(meterLogs).values({
    pgId: roomRow.pgId,
    roomId: input.roomId,
    units: input.readingUnits.toString(),
    readingType: 'checkout',
    recordedAt: formatDate(new Date()),
    notes: input.note ?? (input.settlementId ? `checkout:${input.settlementId}` : 'checkout'),
  });
}

/**
 * Advance official baseline after Workflow A monthly bill finalize.
 * Validates reading monotonicity against previous baseline.
 */
export async function advanceBaseline(input: AdvanceBaselineInput): Promise<void> {
  if (!input.electricityBillId) {
    throw new MeterTimelineError(
      'advanceBaseline requires electricityBillId from finalize',
      'unauthorized_advance',
    );
  }
  if (!Number.isFinite(input.currentReadingUnits) || input.currentReadingUnits < 0) {
    throw new MeterTimelineError('Invalid current reading units', 'invalid_reading');
  }

  const previous = await resolveOfficialPreviousReading(input.roomId);
  if (input.currentReadingUnits < previous.previousReadingUnits) {
    throw new MeterTimelineError(
      `Current reading ${input.currentReadingUnits} is below official baseline ${previous.previousReadingUnits}`,
      'baseline_regression',
    );
  }

  const [bill] = await db
    .select({ id: electricityBills.id, currentReadingUnits: electricityBills.currentReadingUnits })
    .from(electricityBills)
    .where(
      and(
        eq(electricityBills.id, input.electricityBillId),
        eq(electricityBills.roomId, input.roomId),
        eq(electricityBills.billingMonth, input.billingMonth),
        eq(electricityBills.isPipelineTest, false),
      ),
    )
    .limit(1);

  if (!bill) {
    throw new MeterTimelineError(
      'Electricity bill not found for baseline advance',
      'unauthorized_advance',
    );
  }
}

/** List recent meter events for diagnostics (monthly + checkout types). */
export async function listRoomMeterTimelineEvents(
  roomId: string,
  limit = 20,
): Promise<
  Array<{
    id: string;
    readingType: string;
    units: number;
    recordedAt: string;
    note: string | null;
  }>
> {
  const rows = await db
    .select({
      id: meterLogs.id,
      readingType: meterLogs.readingType,
      units: meterLogs.units,
      recordedAt: meterLogs.recordedAt,
      note: meterLogs.notes,
    })
    .from(meterLogs)
    .where(eq(meterLogs.roomId, roomId))
    .orderBy(desc(meterLogs.recordedAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    units: Number(r.units),
  }));
}
