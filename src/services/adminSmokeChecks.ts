/**
 * Lightweight read-only smoke checks for the admin health page.
 * Safe to run on every deploy — no mutations.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { todayString } from '@/src/lib/dates';
import { listVacatingPastDueRows } from '@/src/services/vacatingPastDue';

export type SmokeCheckResult = {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
};

export type AdminSmokeReport = {
  asOf: string;
  allPass: boolean;
  checks: SmokeCheckResult[];
};

async function checkActivePropertyBookings(): Promise<SmokeCheckResult> {
  const rows = await db.execute<{ pg_count: string }>(sql`
    SELECT COUNT(DISTINCT p.id)::text AS pg_count
    FROM pgs p
    INNER JOIN floors f ON f.pg_id = p.id
    INNER JOIN rooms r ON r.floor_id = f.id
    INNER JOIN beds b ON b.room_id = r.id
    INNER JOIN bed_reservations br ON br.bed_id = b.id AND br.status = 'active'
    INNER JOIN bookings bk ON bk.id = br.booking_id AND bk.status = 'confirmed'
    WHERE p.archived_at IS NULL
  `);
  const count = Number(rows[0]?.pg_count ?? 0);
  return {
    id: 'active_pg_bookings',
    label: 'At least one PG with active confirmed bookings',
    pass: count >= 1,
    detail:
      count >= 1
        ? `${count} PG(s) with active confirmed stays.`
        : 'No PG has an active confirmed booking — verify occupancy data.',
  };
}

async function checkBookingIntegrity(): Promise<SmokeCheckResult> {
  const missingReservation = await db.execute<{ booking_code: string }>(sql`
    SELECT bk.booking_code
    FROM bookings bk
    WHERE bk.status = 'confirmed'
      AND NOT EXISTS (
        SELECT 1 FROM bed_reservations br
        WHERE br.booking_id = bk.id AND br.status IN ('active', 'hold')
      )
    LIMIT 5
  `);
  const badInvoices = await db.execute<{ invoice_number: string }>(sql`
    SELECT invoice_number
    FROM financial_invoices
    WHERE amount_paise > 0
      AND status NOT IN ('cancelled', 'void')
      AND (
        breakdown IS NULL
        OR jsonb_array_length(COALESCE(breakdown->'lines', '[]'::jsonb)) = 0
      )
    LIMIT 5
  `);

  const issues: string[] = [];
  for (const row of Array.from(missingReservation)) {
    issues.push(`Confirmed booking ${row.booking_code} has no active reservation`);
  }
  for (const row of Array.from(badInvoices)) {
    issues.push(`Invoice ${row.invoice_number} has amount > 0 but empty breakdown lines`);
  }

  return {
    id: 'booking_invoice_integrity',
    label: 'No impossible booking or invoice states',
    pass: issues.length === 0,
    detail:
      issues.length === 0
        ? 'Confirmed bookings have reservations; invoices with amounts have line items.'
        : issues.join('; '),
  };
}

async function checkVacatingPastDueSettlement(): Promise<SmokeCheckResult> {
  const today = todayString();
  const rows = await listVacatingPastDueRows(today);
  const stale = rows.filter(
    (r) => r.daysPastDue >= 1 && !r.settlementId,
  );
  return {
    id: 'vacating_past_due_settlement',
    label: 'No overdue vacating rows >24h without settlement action',
    pass: stale.length === 0,
    detail:
      stale.length === 0
        ? 'All past-due vacating rows have settlement started or are within grace.'
        : `${stale.length} past-due vacating row(s) without settlement: ${stale
            .slice(0, 3)
            .map((r) => r.bookingCode)
            .join(', ')}`,
  };
}

async function checkLastCronRun(): Promise<SmokeCheckResult> {
  try {
    const rows = await db.execute<{ created_at: Date | string }>(sql`
      SELECT created_at
      FROM app_logs
      WHERE route = '/api/cron/automation'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const last = rows[0]?.created_at;
    if (!last) {
      return {
        id: 'cron_automation_hint',
        label: 'Last daily automation cron run',
        pass: true,
        detail: 'No app_logs rows for /api/cron/automation yet (table exists).',
      };
    }
    const when =
      last instanceof Date
        ? last.toISOString()
        : String(last);
    const ageMs = Date.now() - Date.parse(when);
    const pass = ageMs < 48 * 60 * 60 * 1000;
    return {
      id: 'cron_automation_hint',
      label: 'Last daily automation cron run',
      pass,
      detail: pass
        ? `Last cron hint at ${when} (within 48h).`
        : `Last cron hint at ${when} — older than 48h; verify CRON_SECRET schedule.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/relation .*app_logs.* does not exist/i.test(message)) {
      return {
        id: 'cron_automation_hint',
        label: 'Last daily automation cron run',
        pass: true,
        detail: 'app_logs table unavailable — run db:migrate to enable cron hints.',
      };
    }
    throw error;
  }
}

/** Run all read-only admin smoke checks. */
export async function runAdminSmokeChecks(): Promise<AdminSmokeReport> {
  const checks = await Promise.all([
    checkActivePropertyBookings(),
    checkBookingIntegrity(),
    checkVacatingPastDueSettlement(),
    checkLastCronRun(),
  ]);
  return {
    asOf: new Date().toISOString(),
    allPass: checks.every((c) => c.pass),
    checks,
  };
}
