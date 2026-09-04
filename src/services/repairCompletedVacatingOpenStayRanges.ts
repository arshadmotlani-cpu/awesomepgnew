/**
 * Close open-ended stay_ranges for completed vacating checkouts.
 *
 * Root cause companion: shortenBookingReservationsToDate used
 * `upper(stay_range) > end`, which never matches NULL open-ended ranges.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog } from '@/src/db/schema';
import { stayRangeExclusiveEnd } from '@/src/lib/vacating/vacatingBedSemantics';

export type CompletedVacatingOpenStayRepairRow = {
  reservationId: string;
  bookingId: string;
  bookingCode: string;
  customerName: string;
  vacatingDate: string;
  exclusiveEnd: string;
  beforeUpper: string | null;
};

export async function listCompletedVacatingOpenStayRanges(): Promise<
  CompletedVacatingOpenStayRepairRow[]
> {
  const rows = await db.execute<{
    reservation_id: string;
    booking_id: string;
    booking_code: string;
    customer_name: string;
    vacating_date: string;
    before_upper: string | null;
  }>(sql`
    SELECT
      br.id::text AS reservation_id,
      bk.id::text AS booking_id,
      bk.booking_code,
      c.full_name AS customer_name,
      vr.vacating_date::text AS vacating_date,
      upper(br.stay_range)::text AS before_upper
    FROM bed_reservations br
    JOIN bookings bk ON bk.id = br.booking_id
    JOIN customers c ON c.id = bk.customer_id
    JOIN vacating_requests vr ON vr.booking_id = bk.id AND vr.status = 'completed'
    WHERE br.kind = 'primary'
      AND br.status = 'completed'
      AND upper(br.stay_range) IS NULL
      AND bk.is_test = false
      AND c.is_test = false
    ORDER BY vr.vacating_date, bk.booking_code
  `);
  const list = Array.isArray(rows) ? rows : ((rows as { rows?: typeof rows }).rows ?? []);
  return list.map((row) => ({
    reservationId: row.reservation_id,
    bookingId: row.booking_id,
    bookingCode: row.booking_code,
    customerName: row.customer_name,
    vacatingDate: row.vacating_date,
    exclusiveEnd: stayRangeExclusiveEnd(row.vacating_date),
    beforeUpper: row.before_upper,
  }));
}

export async function repairCompletedVacatingOpenStayRanges(input?: {
  dryRun?: boolean;
  adminId?: string | null;
}): Promise<{
  dryRun: boolean;
  candidates: CompletedVacatingOpenStayRepairRow[];
  repaired: number;
}> {
  const candidates = await listCompletedVacatingOpenStayRanges();
  if (input?.dryRun !== false) {
    return { dryRun: true, candidates, repaired: 0 };
  }

  let repaired = 0;
  for (const row of candidates) {
    const result = await db.execute(sql`
      UPDATE bed_reservations
      SET
        stay_range = daterange(lower(stay_range), ${row.exclusiveEnd}::date, '[)'),
        updated_at = now()
      WHERE id = ${row.reservationId}::uuid
        AND upper(stay_range) IS NULL
      RETURNING id
    `);
    const updated = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
    if (updated.length === 0) continue;
    repaired += 1;
    await db.insert(auditLog).values({
      actorType: input?.adminId ? 'admin' : 'system',
      actorId: input?.adminId ?? null,
      entity: 'bed_reservation',
      entityId: row.reservationId,
      action: 'repair_completed_vacating_open_stay_range',
      diff: {
        bookingCode: row.bookingCode,
        vacatingDate: row.vacatingDate,
        exclusiveEnd: row.exclusiveEnd,
        beforeUpper: row.beforeUpper,
      },
    });
  }

  return { dryRun: false, candidates, repaired };
}
