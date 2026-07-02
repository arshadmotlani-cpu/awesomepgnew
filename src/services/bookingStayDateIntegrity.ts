/**
 * Audit + repair booking stay dates — ensures every active booking has a valid
 * [check-in, check-out) stay_range lower bound for resident portal loaders.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bedReservations } from '@/src/db/schema';
import { formatDate, normalizeIsoDateOnly } from '@/src/lib/dates';
import { logger } from '@/src/lib/logger';
import {
  listBookingsForCustomer,
  listPaymentsForBooking,
  listResidentBookingsForCustomer,
} from '@/src/db/queries/customer';
import { listOpenRequestsForCustomer } from '@/src/services/residentRequests';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { loadResidentAccountContextSafe } from '@/src/services/residentAccountContextSafe';

function toIsoTimestamp(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function nonEmptyCheckIn(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export const ACTIVE_BOOKING_STATUSES = [
  'confirmed',
  'completed',
  'pending_payment',
  'pending_approval',
] as const;

export type BookingStayDateIssueKind =
  | 'missing_primary_reservation'
  | 'null_stay_range_lower'
  | 'checkout_without_checkin'
  | 'empty_stay_range'
  | 'invalid_resolved_dates';

export type BookingStayDateAuditRow = {
  bookingId: string;
  bookingCode: string;
  customerId: string;
  customerEmail: string | null;
  customerName: string;
  bookingStatus: string;
  durationMode: string;
  expectedCheckoutDate: string | null;
  bookingCreatedAt: string;
  reservationId: string | null;
  reservationStatus: string | null;
  stayRangeLower: string | null;
  stayRangeUpper: string | null;
  stayRangeRaw: string | null;
  reservationCreatedAt: string | null;
  derivedCheckInDate: string | null;
  issues: BookingStayDateIssueKind[];
};

export type BookingStayDateRepairAction = {
  bookingId: string;
  bookingCode: string;
  reservationId: string;
  beforeStayRange: string;
  afterStayRange: string;
  resolvedCheckIn: string;
  resolvedCheckOut: string;
  checkInSource: string;
  checkOutSource: string;
};

export type BookingStayDateRepairReport = {
  auditedAt: string;
  execute: boolean;
  totalActiveBookings: number;
  issueCount: number;
  repairableCount: number;
  repairedCount: number;
  skippedCount: number;
  issues: BookingStayDateAuditRow[];
  repairs: BookingStayDateRepairAction[];
  verification: Array<{
    customerId: string;
    customerEmail: string | null;
    bookingCode: string;
    loginContextOk: boolean;
    myBookingsOk: boolean;
    residentDashboardOk: boolean;
    refundOk: boolean;
    requestsOk: boolean;
    paymentsOk: boolean;
    notes: string[];
  }>;
};

type RawAuditRow = {
  booking_id: string;
  booking_code: string;
  customer_id: string;
  customer_email: string | null;
  customer_name: string;
  booking_status: string;
  duration_mode: string;
  expected_checkout_date: string | null;
  booking_created_at: Date;
  reservation_id: string | null;
  reservation_status: string | null;
  stay_range_lower: string | null;
  stay_range_upper: string | null;
  stay_range_raw: string | null;
  reservation_created_at: Date | null;
};

function parseCheckInFromStayRangeRaw(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/^\["?(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function isOpenEndedDuration(mode: string): boolean {
  return mode === 'monthly' || mode === 'open_ended';
}

/** Pure date resolver — used by repair + unit tests. */
export function resolveBookingStayDates(input: {
  stayRangeLower: string | null;
  stayRangeUpper: string | null;
  stayRangeRaw: string | null;
  expectedCheckoutDate: string | null;
  durationMode: string;
  bookingCreatedAt: Date | string;
  reservationCreatedAt: Date | string | null;
}): { checkIn: string; checkOut: string; checkInSource: string; checkOutSource: string } | null {
  const lower = normalizeIsoDateOnly(input.stayRangeLower ?? '');
  const upper = normalizeIsoDateOnly(input.stayRangeUpper ?? '');
  const expectedCheckout = normalizeIsoDateOnly(input.expectedCheckoutDate ?? '');
  const fromRaw = parseCheckInFromStayRangeRaw(input.stayRangeRaw);

  let checkIn: string | null = lower || fromRaw || null;
  let checkInSource = lower ? 'stay_range_lower' : fromRaw ? 'stay_range_raw' : '';

  if (!checkIn && expectedCheckout) {
    const bookingDay = formatDate(
      input.bookingCreatedAt instanceof Date
        ? input.bookingCreatedAt
        : new Date(input.bookingCreatedAt),
    );
    const normalizedBookingDay = normalizeIsoDateOnly(bookingDay);
    if (normalizedBookingDay && normalizedBookingDay < expectedCheckout) {
      checkIn = normalizedBookingDay;
      checkInSource = 'booking_created_at';
    }
  }

  if (!checkIn && input.reservationCreatedAt) {
    const resDay = formatDate(
      input.reservationCreatedAt instanceof Date
        ? input.reservationCreatedAt
        : new Date(input.reservationCreatedAt),
    );
    const normalized = normalizeIsoDateOnly(resDay);
    if (normalized) {
      checkIn = normalized;
      checkInSource = 'reservation_created_at';
    }
  }

  if (!checkIn) {
    const bookingDay = normalizeIsoDateOnly(
      formatDate(
        input.bookingCreatedAt instanceof Date
          ? input.bookingCreatedAt
          : new Date(input.bookingCreatedAt),
      ),
    );
    if (bookingDay) {
      checkIn = bookingDay;
      checkInSource = 'booking_created_at_fallback';
    }
  }

  if (!checkIn) return null;

  let checkOut: string | null = null;
  let checkOutSource = '';

  if (expectedCheckout) {
    checkOut = expectedCheckout;
    checkOutSource = 'expected_checkout_date';
  } else if (upper) {
    checkOut = upper;
    checkOutSource = 'stay_range_upper';
  } else if (isOpenEndedDuration(input.durationMode)) {
    checkOut = null;
    checkOutSource = 'open_ended_unbounded';
  } else {
    checkOut = formatDate(
      new Date(Date.parse(`${checkIn}T00:00:00Z`) + 7 * 86_400_000),
    );
    checkOutSource = 'default_seven_nights';
  }

  if (!checkOut || checkOut <= checkIn) {
    if (isOpenEndedDuration(input.durationMode)) {
      checkOut = null;
      checkOutSource = 'open_ended_unbounded';
    } else if (expectedCheckout && expectedCheckout > checkIn) {
      checkOut = expectedCheckout;
      checkOutSource = 'expected_checkout_date';
    } else {
      return null;
    }
  }

  return { checkIn, checkOut, checkInSource, checkOutSource };
}

function classifyRow(row: RawAuditRow): BookingStayDateAuditRow {
  const issues: BookingStayDateIssueKind[] = [];
  const derivedCheckInDate = row.stay_range_lower
    ? normalizeIsoDateOnly(row.stay_range_lower)
    : null;

  if (!row.reservation_id) {
    issues.push('missing_primary_reservation');
  } else {
    if (!row.stay_range_lower) {
      issues.push('null_stay_range_lower');
    }
    if (row.expected_checkout_date && !derivedCheckInDate) {
      issues.push('checkout_without_checkin');
    }
    if (row.stay_range_raw === 'empty' || row.stay_range_raw === '[,)') {
      issues.push('empty_stay_range');
    }
  }

  return {
    bookingId: row.booking_id,
    bookingCode: row.booking_code,
    customerId: row.customer_id,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    bookingStatus: row.booking_status,
    durationMode: row.duration_mode,
    expectedCheckoutDate: row.expected_checkout_date,
    bookingCreatedAt: toIsoTimestamp(row.booking_created_at) ?? '',
    reservationId: row.reservation_id,
    reservationStatus: row.reservation_status,
    stayRangeLower: row.stay_range_lower,
    stayRangeUpper: row.stay_range_upper,
    stayRangeRaw: row.stay_range_raw,
    reservationCreatedAt: toIsoTimestamp(row.reservation_created_at),
    derivedCheckInDate,
    issues,
  };
}

export async function auditBookingStayDateIntegrity(): Promise<BookingStayDateAuditRow[]> {
  const rows = await db.execute<RawAuditRow>(sql`
    SELECT
      b.id::text AS booking_id,
      b.booking_code,
      b.customer_id::text,
      c.email AS customer_email,
      c.full_name AS customer_name,
      b.status::text AS booking_status,
      b.duration_mode::text AS duration_mode,
      b.expected_checkout_date::text AS expected_checkout_date,
      b.created_at AS booking_created_at,
      br.id::text AS reservation_id,
      br.status::text AS reservation_status,
      lower(br.stay_range)::text AS stay_range_lower,
      upper(br.stay_range)::text AS stay_range_upper,
      br.stay_range::text AS stay_range_raw,
      br.created_at AS reservation_created_at
    FROM bookings b
    INNER JOIN customers c ON c.id = b.customer_id
    LEFT JOIN LATERAL (
      SELECT br.*
      FROM bed_reservations br
      WHERE br.booking_id = b.id
        AND br.kind = 'primary'
        AND br.status IN ('active', 'hold')
      ORDER BY br.created_at ASC
      LIMIT 1
    ) br ON true
    WHERE b.status IN ('confirmed', 'completed', 'pending_payment', 'pending_approval')
    ORDER BY b.created_at DESC
  `);

  const mapped = (Array.isArray(rows) ? rows : []).map(classifyRow);
  return mapped.filter((r) => r.issues.length > 0);
}

async function verifyRepairedResidents(
  repairs: BookingStayDateRepairAction[],
  issueRows: BookingStayDateAuditRow[],
): Promise<BookingStayDateRepairReport['verification']> {
  const byCustomer = new Map<
    string,
    { email: string | null; bookingCode: string; bookingId: string }
  >();
  for (const repair of repairs) {
    const issue = issueRows.find((i) => i.bookingId === repair.bookingId);
    if (!issue) continue;
    byCustomer.set(issue.customerId, {
      email: issue.customerEmail,
      bookingCode: issue.bookingCode,
      bookingId: issue.bookingId,
    });
  }

  const results: BookingStayDateRepairReport['verification'] = [];

  for (const [customerId, meta] of byCustomer) {
    const notes: string[] = [];

    const contextLoad = await loadResidentAccountContextSafe(customerId, meta.email);
    const loginContextOk = contextLoad.ok;
    if (!loginContextOk) {
      notes.push(
        contextLoad.reason === 'load_failed'
          ? `post-login context failed: ${contextLoad.errorMessage ?? 'unknown'}`
          : 'customer not found',
      );
    } else if (contextLoad.ctx.primaryBooking?.checkInDate == null) {
      notes.push('primary booking still has null check-in after repair');
    }

    const bookingsRes = await listBookingsForCustomer(customerId);
    const myBookingsOk =
      bookingsRes.ok &&
      bookingsRes.data
        .filter((b) => b.id === meta.bookingId)
        .every((b) => nonEmptyCheckIn(b.checkInDate));
    if (!myBookingsOk) {
      notes.push('my bookings still missing check-in on repaired booking');
    }

    const residentBookings = await listResidentBookingsForCustomer(customerId);
    const residentDashboardOk =
      residentBookings.ok &&
      residentBookings.data.every((b) => b.checkInDate != null && b.checkInDate.length > 0);
    if (!residentDashboardOk) {
      notes.push('resident dashboard booking rows still missing check-in');
    }

    let refundOk = true;
    try {
      await getDepositSummaryForBooking(meta.bookingId);
    } catch (error) {
      refundOk = false;
      notes.push(
        `deposit/refund summary threw: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    let requestsOk = true;
    try {
      await listOpenRequestsForCustomer(customerId);
    } catch (error) {
      requestsOk = false;
      notes.push(
        `requests loader threw: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    let paymentsOk = true;
    try {
      const payments = await listPaymentsForBooking(meta.bookingId);
      if (!payments.ok) {
        paymentsOk = false;
        notes.push(`payments list failed: ${payments.error ?? 'unknown'}`);
      }
    } catch (error) {
      paymentsOk = false;
      notes.push(
        `payments loader threw: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    results.push({
      customerId,
      customerEmail: meta.email,
      bookingCode: meta.bookingCode,
      loginContextOk,
      myBookingsOk,
      residentDashboardOk,
      refundOk,
      requestsOk,
      paymentsOk,
      notes,
    });
  }

  return results;
}

export async function repairBookingStayDateIntegrity(options?: {
  execute?: boolean;
}): Promise<BookingStayDateRepairReport> {
  const execute = options?.execute === true;
  const allRows = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count
    FROM bookings b
    WHERE b.status IN ('confirmed', 'completed', 'pending_payment', 'pending_approval')
  `);
  const totalActiveBookings = (Array.isArray(allRows) ? allRows[0]?.count : 0) ?? 0;

  const issues = await auditBookingStayDateIntegrity();
  const repairs: BookingStayDateRepairAction[] = [];
  let repairedCount = 0;
  let skippedCount = 0;

  for (const issue of issues) {
    if (!issue.reservationId || issue.issues.includes('missing_primary_reservation')) {
      skippedCount += 1;
      continue;
    }

    const resolved = resolveBookingStayDates({
      stayRangeLower: issue.stayRangeLower,
      stayRangeUpper: issue.stayRangeUpper,
      stayRangeRaw: issue.stayRangeRaw,
      expectedCheckoutDate: issue.expectedCheckoutDate,
      durationMode: issue.durationMode,
      bookingCreatedAt: issue.bookingCreatedAt,
      reservationCreatedAt: issue.reservationCreatedAt,
    });

    if (!resolved) {
      issue.issues.push('invalid_resolved_dates');
      skippedCount += 1;
      continue;
    }

    const afterStayRange = `[${resolved.checkIn},${resolved.checkOut})`;
    const action: BookingStayDateRepairAction = {
      bookingId: issue.bookingId,
      bookingCode: issue.bookingCode,
      reservationId: issue.reservationId,
      beforeStayRange: issue.stayRangeRaw ?? '—',
      afterStayRange,
      resolvedCheckIn: resolved.checkIn,
      resolvedCheckOut: resolved.checkOut,
      checkInSource: resolved.checkInSource,
      checkOutSource: resolved.checkOutSource,
    };
    repairs.push(action);

    if (execute) {
      await db
        .update(bedReservations)
        .set({
          stayRange: sql`daterange(${resolved.checkIn}::date, ${resolved.checkOut}::date, '[)')`,
          updatedAt: new Date(),
        })
        .where(eq(bedReservations.id, issue.reservationId));

      await db.insert(auditLog).values({
        actorType: 'system',
        actorId: null,
        entity: 'bed_reservation',
        entityId: issue.reservationId,
        action: 'repair_stay_range',
        diff: {
          bookingId: issue.bookingId,
          bookingCode: issue.bookingCode,
          before: issue.stayRangeRaw,
          after: afterStayRange,
          checkInSource: resolved.checkInSource,
          checkOutSource: resolved.checkOutSource,
          issues: issue.issues,
        },
      });

      repairedCount += 1;
      logger.info('booking stay_range repaired', {
        bookingId: issue.bookingId,
        bookingCode: issue.bookingCode,
        reservationId: issue.reservationId,
        checkIn: resolved.checkIn,
        checkOut: resolved.checkOut,
      });
    }
  }

  const postIssues = execute ? await auditBookingStayDateIntegrity() : issues;
  const verification =
    execute && repairs.length > 0
      ? await verifyRepairedResidents(repairs, issues)
      : [];

  return {
    auditedAt: new Date().toISOString(),
    execute,
    totalActiveBookings,
    issueCount: issues.length,
    repairableCount: repairs.length,
    repairedCount: execute ? repairedCount : 0,
    skippedCount,
    issues: execute ? postIssues : issues,
    repairs,
    verification,
  };
}

export function formatBookingStayDateReportMarkdown(report: BookingStayDateRepairReport): string {
  const lines: string[] = [
    '# Booking stay date integrity report',
    '',
    `- Audited at: ${report.auditedAt}`,
    `- Mode: ${report.execute ? 'EXECUTE (repairs applied)' : 'AUDIT ONLY'}`,
    `- Active bookings scanned: ${report.totalActiveBookings}`,
    `- Issues found: ${report.issueCount}`,
    `- Repairable: ${report.repairableCount}`,
    `- Repaired: ${report.repairedCount}`,
    `- Skipped: ${report.skippedCount}`,
    '',
  ];

  if (report.issues.length === 0) {
    lines.push('No integrity issues found.');
    return lines.join('\n');
  }

  lines.push('## Issues', '');
  for (const row of report.issues) {
    lines.push(
      `### ${row.bookingCode} (${row.bookingStatus})`,
      `- Customer: ${row.customerName} · ${row.customerEmail ?? 'no email'}`,
      `- Duration: ${row.durationMode}`,
      `- Expected checkout: ${row.expectedCheckoutDate ?? '—'}`,
      `- stay_range: ${row.stayRangeRaw ?? '—'}`,
      `- lower bound: ${row.stayRangeLower ?? 'NULL'}`,
      `- Issues: ${row.issues.join(', ')}`,
      '',
    );
  }

  if (report.repairs.length > 0) {
    lines.push('## Repairs', '');
    for (const r of report.repairs) {
      lines.push(
        `- **${r.bookingCode}**: \`${r.beforeStayRange}\` → \`${r.afterStayRange}\` (check-in from ${r.checkInSource})`,
      );
    }
    lines.push('');
  }

  if (report.verification.length > 0) {
    lines.push('## Post-repair verification', '');
    for (const v of report.verification) {
      const flows = [
        `login=${v.loginContextOk ? 'OK' : 'FAIL'}`,
        `bookings=${v.myBookingsOk ? 'OK' : 'FAIL'}`,
        `dashboard=${v.residentDashboardOk ? 'OK' : 'FAIL'}`,
        `refund=${v.refundOk ? 'OK' : 'FAIL'}`,
        `requests=${v.requestsOk ? 'OK' : 'FAIL'}`,
        `payments=${v.paymentsOk ? 'OK' : 'FAIL'}`,
      ].join(', ');
      lines.push(
        `- ${v.customerEmail ?? v.customerId} (${v.bookingCode}): ${flows}${v.notes.length ? ` — ${v.notes.join('; ')}` : ''}`,
      );
    }
  }

  return lines.join('\n');
}
