/**
 * Booking Brain integrity — thin structural auditor (Wave 1).
 */

import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';

export type BookingBrainFindingCode =
  | 'STALE_DRAFT_NO_HOLD'
  | 'RESERVE_WITHOUT_HOLD'
  | 'CONFIRMED_WITHOUT_BED'
  | 'DOUBLE_BED_ASSIGNMENT';

export type BookingBrainFinding = {
  code: BookingBrainFindingCode;
  severity: 'P0' | 'P1' | 'P2';
  entityType: 'booking' | 'bed';
  entityId: string;
  detail: string;
  repairable: boolean;
};

export type BookingBrainIntegrityReport = {
  asOf: string;
  findings: BookingBrainFinding[];
  pass: boolean;
};

type Row = Record<string, unknown>;

function asRows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  return [];
}

const STALE_DRAFT_DAYS = 14;

export async function runBookingBrainIntegrityAudit(): Promise<BookingBrainIntegrityReport> {
  const findings: BookingBrainFinding[] = [];

  const staleDrafts = asRows(
    await db.execute(sql`
      SELECT
        bk.id::text AS booking_id,
        bk.booking_code,
        bk.status::text,
        bk.created_at::text
      FROM bookings bk
      LEFT JOIN bed_reserve_holds h ON h.booking_id = bk.id
        AND h.status IN ('pending_payment', 'under_review', 'active')
      WHERE bk.status = 'draft'
        AND bk.duration_mode = 'reserve'
        AND h.id IS NULL
        AND bk.created_at < NOW() - (${STALE_DRAFT_DAYS} * INTERVAL '1 day')
      ORDER BY bk.created_at ASC
      LIMIT 100
    `),
  );

  for (const row of staleDrafts) {
    findings.push({
      code: 'STALE_DRAFT_NO_HOLD',
      severity: 'P2',
      entityType: 'booking',
      entityId: String(row.booking_id),
      detail: `Draft reserve ${row.booking_code} older than ${STALE_DRAFT_DAYS}d with no hold`,
      repairable: true,
    });
  }

  const reserveNoHold = asRows(
    await db.execute(sql`
      SELECT
        bk.id::text AS booking_id,
        bk.booking_code,
        bk.status::text
      FROM bookings bk
      LEFT JOIN bed_reserve_holds h ON h.booking_id = bk.id
        AND h.status IN ('pending_payment', 'under_review', 'active')
      WHERE bk.duration_mode = 'reserve'
        AND bk.status IN ('pending_payment', 'pending_approval')
        AND h.id IS NULL
      ORDER BY bk.created_at DESC
      LIMIT 100
    `),
  );

  for (const row of reserveNoHold) {
    findings.push({
      code: 'RESERVE_WITHOUT_HOLD',
      severity: 'P1',
      entityType: 'booking',
      entityId: String(row.booking_id),
      detail: `Reserve ${row.booking_code} status=${row.status} has no active hold`,
      repairable: false,
    });
  }

  const confirmedNoBed = asRows(
    await db.execute(sql`
      SELECT
        bk.id::text AS booking_id,
        bk.booking_code
      FROM bookings bk
      WHERE bk.status = 'confirmed'
        AND bk.duration_mode::text IS DISTINCT FROM 'reserve'
        AND NOT EXISTS (
          SELECT 1 FROM bed_reservations br
          WHERE br.booking_id = bk.id
            AND br.status = 'active'
            AND br.kind = 'primary'
        )
      ORDER BY bk.updated_at DESC
      LIMIT 100
    `),
  );

  for (const row of confirmedNoBed) {
    findings.push({
      code: 'CONFIRMED_WITHOUT_BED',
      severity: 'P0',
      entityType: 'booking',
      entityId: String(row.booking_id),
      detail: `Confirmed booking ${row.booking_code} has no active primary bed reservation`,
      repairable: false,
    });
  }

  const doubleBed = asRows(
    await db.execute(sql`
      SELECT
        br.bed_id::text AS bed_id,
        b.bed_code,
        COUNT(*)::int AS n
      FROM bed_reservations br
      JOIN beds b ON b.id = br.bed_id
      WHERE br.status = 'active'
        AND br.kind = 'primary'
        AND br.stay_range @> CURRENT_DATE
      GROUP BY br.bed_id, b.bed_code
      HAVING COUNT(*) > 1
      LIMIT 50
    `),
  );

  for (const row of doubleBed) {
    findings.push({
      code: 'DOUBLE_BED_ASSIGNMENT',
      severity: 'P0',
      entityType: 'bed',
      entityId: String(row.bed_id),
      detail: `Bed ${row.bed_code} has ${row.n} concurrent active primary stays today`,
      repairable: false,
    });
  }

  const pass = !findings.some((f) => f.severity === 'P0');
  return { asOf: new Date().toISOString(), findings, pass };
}

/**
 * Safe repair: cancel stale draft reserves (≥14d) with no hold.
 */
export async function repairStaleDraftReservesWithoutHold(): Promise<{
  cancelledBookingIds: string[];
}> {
  const report = await runBookingBrainIntegrityAudit();
  const cancelledBookingIds: string[] = [];

  for (const f of report.findings.filter(
    (x) => x.code === 'STALE_DRAFT_NO_HOLD' && x.repairable,
  )) {
    const result = asRows(
      await db.execute(sql`
        UPDATE bookings
        SET
          status = 'cancelled',
          cancelled_at = NOW(),
          cancellation_reason = 'Health Brain: stale draft reserve (≥14d) with no hold cancelled',
          updated_at = NOW()
        WHERE id = ${f.entityId}::uuid
          AND status = 'draft'
          AND duration_mode = 'reserve'
        RETURNING id::text AS booking_id
      `),
    );
    if (result[0]?.booking_id) {
      cancelledBookingIds.push(String(result[0].booking_id));
    }
  }

  return { cancelledBookingIds };
}
