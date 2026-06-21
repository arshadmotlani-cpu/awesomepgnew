/**
 * Daily vacating past-due check — surfaces stale move-outs to admins.
 * Beds stay occupied until checkout settlement completes (see WORKFLOWS / DECISIONS).
 */

import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, checkoutSettlements, vacatingRequests } from '@/src/db/schema';
import { todayString } from '@/src/lib/dates';
import { syncActionItemsForCron } from '@/src/services/actionItems';

export type VacatingPastDueRow = {
  vacatingRequestId: string;
  bookingId: string;
  bookingCode: string;
  vacatingDate: string;
  status: 'pending' | 'approved';
  settlementId: string | null;
  settlementStatus: string | null;
  daysPastDue: number;
};

export async function listVacatingPastDueRows(
  today = todayString(),
): Promise<VacatingPastDueRow[]> {
  const rows = await db
    .select({
      vacatingRequestId: vacatingRequests.id,
      bookingId: vacatingRequests.bookingId,
      bookingCode: bookings.bookingCode,
      vacatingDate: vacatingRequests.vacatingDate,
      status: vacatingRequests.status,
      settlementId: checkoutSettlements.id,
      settlementStatus: checkoutSettlements.status,
    })
    .from(vacatingRequests)
    .innerJoin(bookings, eq(bookings.id, vacatingRequests.bookingId))
    .leftJoin(
      checkoutSettlements,
      eq(checkoutSettlements.vacatingRequestId, vacatingRequests.id),
    )
    .where(
      and(
        inArray(vacatingRequests.status, ['pending', 'approved']),
        lt(vacatingRequests.vacatingDate, today),
        eq(bookings.status, 'confirmed'),
      ),
    );

  return rows.map((row) => {
    const vacatingDate = String(row.vacatingDate);
    const daysPastDue = Math.max(
      1,
      Math.floor(
        (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${vacatingDate}T00:00:00Z`)) /
          86_400_000,
      ),
    );
    return {
      vacatingRequestId: row.vacatingRequestId,
      bookingId: row.bookingId,
      bookingCode: row.bookingCode,
      vacatingDate,
      status: row.status as 'pending' | 'approved',
      settlementId: row.settlementId,
      settlementStatus: row.settlementStatus,
      daysPastDue,
    };
  });
}

/** Run from daily cron — refreshes action items + admin notifications for past-due move-outs. */
export async function processVacatingPastDueDaily(): Promise<{
  today: string;
  pastDueCount: number;
  rows: VacatingPastDueRow[];
}> {
  const today = todayString();
  const rows = await listVacatingPastDueRows(today);
  await syncActionItemsForCron();
  return { today, pastDueCount: rows.length, rows };
}

/** Resolve vacating action items when the underlying request is no longer open. */
export async function resolveStaleVacatingActionItems(): Promise<{ resolved: number }> {
  const rows = await db.execute<{ id: string }>(sql`
    UPDATE action_items ai
    SET status = 'resolved', updated_at = now()
    WHERE ai.type = 'vacating_alert'
      AND ai.status IN ('open', 'in_progress')
      AND NOT EXISTS (
        SELECT 1 FROM vacating_requests vr
        WHERE ai.source_key = 'vacating:' || vr.id::text
          AND vr.status IN ('pending', 'approved')
      )
    RETURNING ai.id
  `);
  return { resolved: rows.length };
}
