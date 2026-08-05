/**
 * Resident Brain integrity — portal, tenancy, draft/reserve, and billing agreement.
 *
 * Detects (and optionally repairs safe cases) when Brains disagree:
 * - Active stay exists but open orphan draft/reserve blocks modern portal
 * - residency_status=active without assigned tenancy
 * - Active monthly stay without current-month rent invoice
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings } from '@/src/db/schema';
import { formatDate } from '@/src/lib/dates';
import { writeAuditLogNonBlocking } from '@/src/lib/audit/writeAuditLog';
import { logger } from '@/src/lib/logger';

export type ResidentBrainFindingCode =
  | 'PORTAL_BLOCKED_BY_ORPHAN_RESERVE'
  | 'ACTIVE_RESIDENCY_WITHOUT_TENANCY'
  | 'MISSING_CURRENT_MONTH_RENT'
  | 'DRAFT_BOOKING_WITH_ACTIVE_STAY'
  | 'MULTIPLE_ACTIVE_PRIMARY_STAYS'
  | 'MISSING_ELECTRICITY_WINDOW';

export type ResidentBrainFinding = {
  code: ResidentBrainFindingCode;
  severity: 'P0' | 'P1' | 'P2';
  customerId: string;
  fullName: string | null;
  phone: string | null;
  detail: string;
  stayBookingId?: string | null;
  stayBookingCode?: string | null;
  problemBookingId?: string | null;
  problemBookingCode?: string | null;
  repairable: boolean;
};

export type ResidentBrainIntegrityReport = {
  asOf: string;
  currentMonth: string;
  findings: ResidentBrainFinding[];
  counts: Record<ResidentBrainFindingCode, number>;
  pass: boolean;
};

function firstOfMonthIso(d = new Date()): string {
  return `${formatDate(d).slice(0, 7)}-01`;
}

function priorMonthIso(currentMonth: string): string {
  const d = new Date(`${currentMonth}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.toISOString().slice(0, 7)}-01`;
}

function emptyCounts(): Record<ResidentBrainFindingCode, number> {
  return {
    PORTAL_BLOCKED_BY_ORPHAN_RESERVE: 0,
    ACTIVE_RESIDENCY_WITHOUT_TENANCY: 0,
    MISSING_CURRENT_MONTH_RENT: 0,
    DRAFT_BOOKING_WITH_ACTIVE_STAY: 0,
    MULTIPLE_ACTIVE_PRIMARY_STAYS: 0,
    MISSING_ELECTRICITY_WINDOW: 0,
  };
}

type Row = Record<string, unknown>;

function asRows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  return [];
}

export async function runResidentBrainIntegrityAudit(opts?: {
  currentMonth?: string;
}): Promise<ResidentBrainIntegrityReport> {
  const currentMonth = opts?.currentMonth ?? firstOfMonthIso();
  const findings: ResidentBrainFinding[] = [];

  const blocked = asRows(
    await db.execute(sql`
      WITH active_stays AS (
        SELECT DISTINCT ON (bk.customer_id)
          bk.customer_id,
          bk.id AS stay_booking_id,
          bk.booking_code AS stay_booking_code,
          c.full_name,
          c.phone
        FROM bookings bk
        JOIN customers c ON c.id = bk.customer_id
        JOIN bed_reservations br ON br.booking_id = bk.id
          AND br.status = 'active' AND br.kind = 'primary'
        WHERE bk.status = 'confirmed'
          AND bk.duration_mode::text IS DISTINCT FROM 'reserve'
          AND (
            (br.stay_range @> CURRENT_DATE)
            OR (
              lower(br.stay_range) > CURRENT_DATE
              AND bk.duration_mode IN ('monthly', 'open_ended')
            )
          )
        ORDER BY bk.customer_id, (br.stay_range @> CURRENT_DATE) DESC, lower(br.stay_range) DESC
      ),
      open_reserves AS (
        SELECT DISTINCT ON (bk.customer_id)
          bk.customer_id,
          bk.id AS reserve_booking_id,
          bk.booking_code AS reserve_booking_code,
          bk.status AS reserve_status
        FROM bookings bk
        LEFT JOIN bed_reserve_holds h ON h.booking_id = bk.id
        WHERE bk.duration_mode = 'reserve'
          AND bk.status IN ('draft', 'pending_payment', 'pending_approval')
          AND (
            h.id IS NULL
            OR h.status IN ('pending_payment', 'under_review', 'active')
          )
        ORDER BY bk.customer_id, bk.created_at DESC
      )
      SELECT
        a.customer_id::text,
        a.full_name,
        a.phone,
        a.stay_booking_id::text,
        a.stay_booking_code,
        o.reserve_booking_id::text,
        o.reserve_booking_code,
        o.reserve_status::text,
        (h.id IS NULL) AS orphan_no_hold
      FROM active_stays a
      JOIN open_reserves o ON o.customer_id = a.customer_id
      LEFT JOIN bed_reserve_holds h ON h.booking_id = o.reserve_booking_id
        AND h.status IN ('pending_payment', 'under_review', 'active')
      ORDER BY a.full_name
    `),
  );

  for (const row of blocked) {
    const orphan = row.orphan_no_hold === true || row.orphan_no_hold === 't';
    findings.push({
      code: 'PORTAL_BLOCKED_BY_ORPHAN_RESERVE',
      severity: 'P0',
      customerId: String(row.customer_id),
      fullName: row.full_name != null ? String(row.full_name) : null,
      phone: row.phone != null ? String(row.phone) : null,
      stayBookingId: row.stay_booking_id != null ? String(row.stay_booking_id) : null,
      stayBookingCode: row.stay_booking_code != null ? String(row.stay_booking_code) : null,
      problemBookingId: row.reserve_booking_id != null ? String(row.reserve_booking_id) : null,
      problemBookingCode:
        row.reserve_booking_code != null ? String(row.reserve_booking_code) : null,
      detail: `Active stay ${row.stay_booking_code} blocked by open ${row.reserve_status} reserve ${row.reserve_booking_code}${orphan ? ' (no hold — orphan draft)' : ''}`,
      repairable: orphan || String(row.reserve_status) === 'draft',
    });
  }

  const draftsWithStay = asRows(
    await db.execute(sql`
      SELECT
        bk.id::text AS booking_id,
        bk.booking_code,
        bk.status::text,
        bk.duration_mode::text,
        c.id::text AS customer_id,
        c.full_name,
        c.phone,
        stay.id::text AS stay_booking_id,
        stay.booking_code AS stay_booking_code
      FROM bookings bk
      JOIN customers c ON c.id = bk.customer_id
      JOIN bookings stay ON stay.customer_id = c.id
        AND stay.status = 'confirmed'
        AND stay.duration_mode::text IS DISTINCT FROM 'reserve'
      JOIN bed_reservations br ON br.booking_id = stay.id
        AND br.status = 'active' AND br.kind = 'primary'
        AND br.stay_range @> CURRENT_DATE
      WHERE bk.status = 'draft'
        AND bk.id <> stay.id
      ORDER BY bk.created_at DESC
      LIMIT 200
    `),
  );

  for (const row of draftsWithStay) {
    // Reserve orphans already covered as P0; still flag non-reserve drafts.
    if (String(row.duration_mode) === 'reserve') continue;
    findings.push({
      code: 'DRAFT_BOOKING_WITH_ACTIVE_STAY',
      severity: 'P2',
      customerId: String(row.customer_id),
      fullName: row.full_name != null ? String(row.full_name) : null,
      phone: row.phone != null ? String(row.phone) : null,
      stayBookingId: row.stay_booking_id != null ? String(row.stay_booking_id) : null,
      stayBookingCode: row.stay_booking_code != null ? String(row.stay_booking_code) : null,
      problemBookingId: row.booking_id != null ? String(row.booking_id) : null,
      problemBookingCode: row.booking_code != null ? String(row.booking_code) : null,
      detail: `Draft ${row.booking_code} (${row.duration_mode}) coexists with active stay ${row.stay_booking_code}`,
      repairable: false,
    });
  }

  const noTenancy = asRows(
    await db.execute(sql`
      SELECT
        c.id::text AS customer_id,
        c.full_name,
        c.phone
      FROM customers c
      WHERE c.residency_status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM bookings bk
          JOIN bed_reservations br ON br.booking_id = bk.id
            AND br.status = 'active' AND br.kind = 'primary'
          WHERE bk.customer_id = c.id
            AND bk.status = 'confirmed'
            AND bk.duration_mode::text IS DISTINCT FROM 'reserve'
            AND (
              (br.stay_range @> CURRENT_DATE)
              OR (
                lower(br.stay_range) > CURRENT_DATE
                AND bk.duration_mode IN ('monthly', 'open_ended')
              )
            )
        )
      ORDER BY c.full_name
      LIMIT 200
    `),
  );

  for (const row of noTenancy) {
    findings.push({
      code: 'ACTIVE_RESIDENCY_WITHOUT_TENANCY',
      severity: 'P1',
      customerId: String(row.customer_id),
      fullName: row.full_name != null ? String(row.full_name) : null,
      phone: row.phone != null ? String(row.phone) : null,
      detail: 'customers.residency_status=active but no assigned active tenancy',
      repairable: false,
    });
  }

  const missingRent = asRows(
    await db.execute(sql`
      WITH active_stays AS (
        SELECT DISTINCT ON (bk.customer_id)
          bk.customer_id,
          bk.id AS booking_id,
          bk.booking_code,
          c.full_name,
          c.phone,
          coalesce(
            EXTRACT(DAY FROM bk.billing_anchor_date)::int,
            EXTRACT(DAY FROM lower(br.stay_range))::int
          ) AS billing_day,
          lower(br.stay_range)::date AS stay_start
        FROM bookings bk
        JOIN customers c ON c.id = bk.customer_id
        JOIN bed_reservations br ON br.booking_id = bk.id
          AND br.status = 'active' AND br.kind = 'primary'
        WHERE bk.status = 'confirmed'
          AND bk.duration_mode IN ('monthly', 'open_ended')
          AND br.stay_range @> CURRENT_DATE
        ORDER BY bk.customer_id, lower(br.stay_range) DESC
      )
      SELECT
        a.customer_id::text,
        a.full_name,
        a.phone,
        a.booking_id::text,
        a.booking_code,
        a.billing_day,
        a.stay_start::text
      FROM active_stays a
      WHERE
        /* Anniversary model: only overdue if this month's billing day has passed. */
        EXTRACT(DAY FROM CURRENT_DATE)::int >= a.billing_day
        AND a.stay_start < make_date(
          EXTRACT(YEAR FROM CURRENT_DATE)::int,
          EXTRACT(MONTH FROM CURRENT_DATE)::int,
          LEAST(
            a.billing_day,
            EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day'))::int
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM rent_invoices ri
          WHERE ri.booking_id = a.booking_id
            AND ri.billing_month = ${currentMonth}::date
            AND ri.is_adhoc = false
            AND ri.status <> 'cancelled'
        )
      ORDER BY a.full_name
    `),
  );

  for (const row of missingRent) {
    findings.push({
      code: 'MISSING_CURRENT_MONTH_RENT',
      severity: 'P0',
      customerId: String(row.customer_id),
      fullName: row.full_name != null ? String(row.full_name) : null,
      phone: row.phone != null ? String(row.phone) : null,
      stayBookingId: row.booking_id != null ? String(row.booking_id) : null,
      stayBookingCode: row.booking_code != null ? String(row.booking_code) : null,
      detail: `No non-adhoc rent invoice for ${currentMonth} on stay ${row.booking_code}`,
      repairable: false,
    });
  }

  const multiStay = asRows(
    await db.execute(sql`
      WITH active_primary AS (
        SELECT
          bk.customer_id,
          bk.id AS booking_id,
          bk.booking_code,
          c.full_name,
          c.phone
        FROM bookings bk
        JOIN customers c ON c.id = bk.customer_id
        JOIN bed_reservations br ON br.booking_id = bk.id
          AND br.status = 'active' AND br.kind = 'primary'
        WHERE bk.status = 'confirmed'
          AND bk.duration_mode::text IS DISTINCT FROM 'reserve'
          AND br.stay_range @> CURRENT_DATE
      ),
      multi AS (
        SELECT customer_id
        FROM active_primary
        GROUP BY customer_id
        HAVING COUNT(*) > 1
      )
      SELECT
        a.customer_id::text,
        a.full_name,
        a.phone,
        a.booking_id::text,
        a.booking_code,
        (
          SELECT string_agg(ap.booking_code, ', ' ORDER BY ap.booking_code)
          FROM active_primary ap
          WHERE ap.customer_id = a.customer_id
        ) AS all_codes
      FROM active_primary a
      JOIN multi m ON m.customer_id = a.customer_id
      ORDER BY a.full_name, a.booking_code
    `),
  );

  const seenMultiCustomers = new Set<string>();
  for (const row of multiStay) {
    const customerId = String(row.customer_id);
    if (seenMultiCustomers.has(customerId)) continue;
    seenMultiCustomers.add(customerId);
    findings.push({
      code: 'MULTIPLE_ACTIVE_PRIMARY_STAYS',
      severity: 'P1',
      customerId,
      fullName: row.full_name != null ? String(row.full_name) : null,
      phone: row.phone != null ? String(row.phone) : null,
      stayBookingId: row.booking_id != null ? String(row.booking_id) : null,
      stayBookingCode: row.booking_code != null ? String(row.booking_code) : null,
      detail: `Multiple concurrent active primary stays: ${row.all_codes}`,
      repairable: false,
    });
  }

  const priorMonth = priorMonthIso(currentMonth);
  const missingElec = asRows(
    await db.execute(sql`
      WITH active_ac AS (
        SELECT DISTINCT ON (bk.customer_id)
          bk.customer_id,
          bk.id AS booking_id,
          bk.booking_code,
          c.full_name,
          c.phone,
          r.id AS room_id,
          r.room_number,
          lower(br.stay_range)::date AS stay_start
        FROM bookings bk
        JOIN customers c ON c.id = bk.customer_id
        JOIN bed_reservations br ON br.booking_id = bk.id
          AND br.status = 'active' AND br.kind = 'primary'
        JOIN beds b ON b.id = br.bed_id
        JOIN rooms r ON r.id = b.room_id
        JOIN room_types rt ON rt.id = r.room_type_id AND rt.has_ac = true
        WHERE bk.status = 'confirmed'
          AND bk.duration_mode IN ('monthly', 'open_ended')
          AND br.stay_range @> CURRENT_DATE
          AND lower(br.stay_range)::date < ${priorMonth}::date + interval '1 month'
        ORDER BY bk.customer_id, lower(br.stay_range) DESC
      )
      SELECT
        a.customer_id::text,
        a.full_name,
        a.phone,
        a.booking_id::text,
        a.booking_code,
        a.room_number
      FROM active_ac a
      WHERE
        /* Prior month bill expected when stay overlapped that month and a monthly reading exists. */
        EXISTS (
          SELECT 1 FROM meter_logs ml
          WHERE ml.room_id = a.room_id
            AND ml.reading_type = 'monthly'
            AND date_trunc('month', ml.recorded_at::timestamp)::date = ${priorMonth}::date
        )
        AND NOT EXISTS (
          SELECT 1 FROM electricity_invoices ei
          WHERE ei.booking_id = a.booking_id
            AND ei.billing_month = ${priorMonth}::date
            AND coalesce(ei.is_pipeline_test, false) = false
            AND ei.status <> 'cancelled'
        )
      ORDER BY a.full_name
      LIMIT 200
    `),
  );

  for (const row of missingElec) {
    findings.push({
      code: 'MISSING_ELECTRICITY_WINDOW',
      severity: 'P1',
      customerId: String(row.customer_id),
      fullName: row.full_name != null ? String(row.full_name) : null,
      phone: row.phone != null ? String(row.phone) : null,
      stayBookingId: row.booking_id != null ? String(row.booking_id) : null,
      stayBookingCode: row.booking_code != null ? String(row.booking_code) : null,
      detail: `AC room ${row.room_number}: monthly reading for ${priorMonth} but no electricity invoice on stay ${row.booking_code}`,
      repairable: false,
    });
  }

  const counts = emptyCounts();
  for (const f of findings) counts[f.code] += 1;

  const pass =
    counts.PORTAL_BLOCKED_BY_ORPHAN_RESERVE === 0 &&
    counts.MISSING_CURRENT_MONTH_RENT === 0;

  return {
    asOf: new Date().toISOString(),
    currentMonth,
    findings,
    counts,
    pass,
  };
}

export type ResidentBrainRepairResult = {
  cancelledBookingIds: string[];
  skipped: Array<{ bookingId: string; reason: string }>;
};

/**
 * Safe repair: cancel orphan draft/pending reserve bookings that block an active stay
 * when there is no active bed_reserve_hold (abandoned funnel).
 */
export async function repairOrphanReservesBlockingActiveStay(): Promise<ResidentBrainRepairResult> {
  const report = await runResidentBrainIntegrityAudit();
  const cancelledBookingIds: string[] = [];
  const skipped: Array<{ bookingId: string; reason: string }> = [];

  const targets = report.findings.filter(
    (f) => f.code === 'PORTAL_BLOCKED_BY_ORPHAN_RESERVE' && f.repairable && f.problemBookingId,
  );

  for (const f of targets) {
    const bookingId = f.problemBookingId!;
    const [row] = await db
      .select({
        id: bookings.id,
        status: bookings.status,
        durationMode: bookings.durationMode,
        customerId: bookings.customerId,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!row) {
      skipped.push({ bookingId, reason: 'booking_not_found' });
      continue;
    }
    if (row.durationMode !== 'reserve') {
      skipped.push({ bookingId, reason: 'not_reserve' });
      continue;
    }
    if (!['draft', 'pending_payment', 'pending_approval'].includes(row.status)) {
      skipped.push({ bookingId, reason: `status_${row.status}` });
      continue;
    }

    const hold = asRows(
      await db.execute(sql`
        SELECT id::text FROM bed_reserve_holds
        WHERE booking_id = ${bookingId}::uuid
          AND status IN ('pending_payment', 'under_review', 'active')
        LIMIT 1
      `),
    );
    if (hold.length > 0) {
      skipped.push({ bookingId, reason: 'has_active_hold' });
      continue;
    }

    await db
      .update(bookings)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason:
          'Resident Brain integrity: orphan reserve cancelled — customer has active stay; draft was blocking modern portal.',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bookings.id, bookingId),
          inArray(bookings.status, ['draft', 'pending_payment', 'pending_approval']),
        ),
      );

    cancelledBookingIds.push(bookingId);

    await writeAuditLogNonBlocking(db, {
      actorType: 'system',
      actorId: null,
      entity: 'booking',
      entityId: bookingId,
      action: 'resident_brain.orphan_reserve_cancelled',
      diff: {
        customerId: f.customerId,
        stayBookingId: f.stayBookingId,
        stayBookingCode: f.stayBookingCode,
        reserveBookingCode: f.problemBookingCode,
        reason: f.detail,
      },
    }).catch(() => undefined);

    logger.info('resident_brain.orphan_reserve_cancelled', {
      bookingId,
      customerId: f.customerId,
      stayBookingCode: f.stayBookingCode,
    });
  }

  return { cancelledBookingIds, skipped };
}
