#!/usr/bin/env npx tsx
/**
 * Backfill post-approve side effects for APG-2026-0048 after partial approve (occupancy SQL bug).
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/repair-krishna-0048-post-approve.ts
 *   USE_PRODUCTION_DB=1 npx tsx scripts/repair-krishna-0048-post-approve.ts --execute
 */
import { eq, sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('repair-krishna-0048-post-approve.ts');

import { closeDb, db } from '@/src/db/client';
import { auditLog, vacatingRequests } from '@/src/db/schema';
import { shouldShortenStayOnVacatingApproval } from '@/src/lib/occupancyEligibility';
import { reconcileBookingOccupancy } from '@/src/lib/occupancySync';
import { syncVacatingCheckoutRentBilling } from '@/src/services/vacatingCheckoutBilling';

const BOOKING_CODE = 'APG-2026-0048';
const execute = process.argv.includes('--execute');

async function shortenBookingReservationsToDate(bookingId: string, endDate: string) {
  await db.execute(sql`
    UPDATE bed_reservations
    SET
      stay_range = daterange(lower(stay_range), ${endDate}::date, '[)'),
      updated_at = now()
    WHERE booking_id = ${bookingId}
      AND status IN ('hold', 'active')
      AND upper(stay_range) > ${endDate}::date
  `);
}

async function main() {
  const [row] = await db.execute<{
    id: string;
    booking_id: string;
    status: string;
    vacating_date: string;
    resolved_by_admin_id: string | null;
  }>(sql`
    SELECT vr.id, vr.booking_id::text, vr.status, vr.vacating_date::text,
           vr.resolved_by_admin_id::text
    FROM vacating_requests vr
    JOIN bookings b ON b.id = vr.booking_id
    WHERE b.booking_code = ${BOOKING_CODE}
      AND vr.status <> 'rejected'
    ORDER BY vr.created_at DESC
    LIMIT 1
  `);

  if (!row) {
    console.error('No active vacating request for', BOOKING_CODE);
    process.exit(1);
  }

  const [auditApproved] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      sql`${auditLog.entity} = 'vacating_request' AND ${auditLog.entityId} = ${row.id}::uuid AND ${auditLog.action} = 'approved'`,
    )
    .limit(1);

  console.log('Vacating:', row.id, row.status, 'vacate', row.vacating_date);
  console.log('Has approved audit:', Boolean(auditApproved));
  console.log('Execute:', execute);

  if (!execute) {
    console.log('\nDry run. Pass --execute to apply occupancy sync, checkout rent sync, and audit backfill.');
    await closeDb();
    return;
  }

  if (row.status !== 'approved') {
    console.error('Expected approved vacating; got', row.status);
    process.exit(1);
  }

  if (shouldShortenStayOnVacatingApproval(row.vacating_date)) {
    await shortenBookingReservationsToDate(row.booking_id, row.vacating_date);
    const occ = await reconcileBookingOccupancy(row.booking_id);
    console.log('Occupancy reconcile:', occ);
  }

  const rent = await syncVacatingCheckoutRentBilling({
    bookingId: row.booking_id,
    vacatingDate: row.vacating_date,
    actorId: row.resolved_by_admin_id,
    actorType: row.resolved_by_admin_id ? 'admin' : 'system',
  });
  console.log('Checkout rent sync:', rent);

  if (!auditApproved) {
    await db.insert(auditLog).values({
      actorType: row.resolved_by_admin_id ? 'admin' : 'system',
      actorId: row.resolved_by_admin_id,
      entity: 'vacating_request',
      entityId: row.id,
      action: 'approved',
      diff: {
        from: 'pending',
        to: 'approved',
        legacyRepair: true,
        note: 'Backfilled after OPS approve partial commit (reservation_status cast)',
      },
    });
    console.log('Inserted audit_log approved');
  }

  const { evaluateResidencyCheckoutOnBookingEnd } = await import(
    '@/src/services/continuousResidency'
  );
  const checkoutDecision = await evaluateResidencyCheckoutOnBookingEnd(row.booking_id);
  if (checkoutDecision.action === 'KEEP_RESIDENCY_ACTIVE') {
    await db
      .update(vacatingRequests)
      .set({ checkoutSettlementSuppressed: true, updatedAt: new Date() })
      .where(eq(vacatingRequests.id, row.id));
    console.log('Set checkoutSettlementSuppressed');
  }

  const { resolveVacatingApprovalActionItems, refreshAdminNotificationsFromActionItems } =
    await import('@/src/services/actionItems');
  await resolveVacatingApprovalActionItems(row.id);
  await refreshAdminNotificationsFromActionItems();
  console.log('Resolved vacating approval action items');

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
