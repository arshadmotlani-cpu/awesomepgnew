/**
 * Full Operations Center audit against the live database.
 *
 * Verifies:
 * - Card counts match item arrays
 * - No duplicate task ids
 * - Scoped vs super-admin PG visibility
 * - Independent SQL counts match service counts
 *
 * Usage: npx tsx scripts/audit-operations-center.ts
 */
import 'dotenv/config';

import { eq, isNull, sql } from 'drizzle-orm';
import { db, closeDb } from '../src/db/client';
import { kycSubmissions, pgs, vacatingRequests } from '../src/db/schema';
import type { AdminSession } from '../src/lib/auth/session';
import {
  OPERATIONS_CENTER_CARD_ROUTES,
  verifyOperationsCenterCounts,
} from '../src/lib/operationsCenterAudit';
import { todayString } from '../src/lib/dates';
import { getOperationsCenterData } from '../src/services/operationsCenter';
import { listPendingPaymentReviews } from '../src/services/paymentProofQueue';

const FAIL: string[] = [];

function fail(msg: string) {
  FAIL.push(msg);
  console.error(`✗ ${msg}`);
}

function pass(msg: string) {
  console.log(`✓ ${msg}`);
}

function mockSession(partial: Pick<AdminSession, 'role' | 'pgScope'>): AdminSession {
  return {
    kind: 'admin',
    sessionId: 'audit',
    adminId: 'audit',
    email: 'audit@local',
    fullName: 'Audit',
    role: partial.role,
    pgScope: partial.pgScope,
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86_400_000),
  };
}

async function independentCounts(session: AdminSession) {
  const pgFilter =
    session.role === 'super_admin' || session.pgScope.length === 0
      ? sql`true`
      : sql`${pgs.id} = ANY(${session.pgScope}::uuid[])`;

  const [kycRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(kycSubmissions)
    .where(eq(kycSubmissions.status, 'pending'));

  const [vacatingRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vacatingRequests)
    .innerJoin(sql`bookings b ON b.id = ${vacatingRequests.bookingId}`)
    .innerJoin(sql`bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'`)
    .innerJoin(sql`beds ON beds.id = br.bed_id`)
    .innerJoin(sql`rooms ON rooms.id = beds.room_id`)
    .innerJoin(sql`floors ON floors.id = rooms.floor_id`)
    .innerJoin(sql`pgs ON pgs.id = floors.pg_id`)
    .where(
      sql`${vacatingRequests.status} IN ('pending', 'approved') AND ${pgFilter}`,
    );

  const payments = await listPendingPaymentReviews(session);

  return {
    pendingKyc: kycRow?.count ?? 0,
    vacating: vacatingRow?.count ?? 0,
    pendingPaymentsBase: payments.length,
  };
}

async function main() {
  console.log('Operations Center audit\n');

  const pgRows = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(isNull(pgs.archivedAt));

  if (pgRows.length === 0) {
    fail('No PGs in database — seed required');
    process.exit(1);
  }

  const superSession = mockSession({ role: 'super_admin', pgScope: [] });
  const scopedSession = mockSession({
    role: 'pg_manager',
    pgScope: [pgRows[0]!.id],
  });

  for (const [label, route] of Object.entries(OPERATIONS_CENTER_CARD_ROUTES)) {
    if (!route.startsWith('/admin/')) {
      fail(`Card ${label} route invalid: ${route}`);
    } else {
      pass(`Card route ${label} → ${route}`);
    }
  }

  const [superData, scopedData] = await Promise.all([
    getOperationsCenterData(superSession),
    getOperationsCenterData(scopedSession),
  ]);

  for (const [label, data] of [
    ['super_admin', superData],
    ['scoped pg_manager', scopedData],
  ] as const) {
    const structural = verifyOperationsCenterCounts(data);
    if (structural.length > 0) {
      for (const e of structural) fail(`[${label}] ${e}`);
    } else {
      pass(`[${label}] counts match items; tasks deduplicated`);
    }
  }

  if (scopedData.pendingKyc.count > superData.pendingKyc.count) {
    fail('Scoped admin has MORE KYC than super admin');
  } else {
    pass('Scoped KYC count ≤ super admin count');
  }

  const independent = await independentCounts(superSession);
  if (independent.pendingKyc !== superData.pendingKyc.count) {
    fail(
      `KYC count mismatch: service=${superData.pendingKyc.count} sql=${independent.pendingKyc}`,
    );
  } else {
    pass(`KYC count matches SQL (${independent.pendingKyc})`);
  }

  if (independent.vacating !== superData.leavingSoon.count) {
    fail(
      `Vacating count mismatch: service=${superData.leavingSoon.count} sql=${independent.vacating}`,
    );
  } else {
    pass(`Vacating count matches SQL (${independent.vacating})`);
  }

  if (superData.pendingPayments.count < independent.pendingPaymentsBase) {
    fail('Payment count lower than listPendingPaymentReviews base');
  } else {
    pass(
      `Payments count ${superData.pendingPayments.count} (includes PS4/reservation proofs)`,
    );
  }

  if (superData.bedsReleasingSoon.count > superData.leavingSoon.count) {
    fail('Beds releasing count exceeds leaving soon count');
  } else {
    pass('Beds releasing is subset of leaving soon');
  }

  const t0 = performance.now();
  await getOperationsCenterData(superSession);
  const elapsed = performance.now() - t0;
  pass(`Single load completed in ${elapsed.toFixed(0)}ms`);

  if (elapsed > 5000) {
    fail(`Load time ${elapsed.toFixed(0)}ms exceeds 5s threshold`);
  }

  console.log('\n--- Summary ---');
  console.log(`Super admin totals:`);
  console.log(`  Payments: ${superData.pendingPayments.count}`);
  console.log(`  KYC: ${superData.pendingKyc.count}`);
  console.log(`  Vacating: ${superData.leavingSoon.count}`);
  console.log(`  Reservations: ${superData.upcomingReservations.count}`);
  console.log(`  Refunds: ${superData.refundsPending.count}`);
  console.log(`  Electricity: ${superData.electricityPending.count}`);
  console.log(`  PS4: ${superData.ps4Renewals.count}`);
  console.log(`  Tasks: ${superData.tasks.length}`);

  await closeDb();
  if (FAIL.length > 0) {
    console.error(`\n${FAIL.length} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll audit checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
