/**
 * Profile admin resident profile open path (read-only).
 *
 * Usage:
 *   ADMIN_PROFILE=1 ADMIN_DB_PROFILE=1 npx tsx scripts/profile-resident-profile-open.ts
 *   ADMIN_PROFILE=1 ADMIN_DB_PROFILE=1 npx tsx scripts/profile-resident-profile-open.ts "Waqar Ahmed"
 */
import { performance } from 'node:perf_hooks';
import { eq, ilike, isNull } from 'drizzle-orm';
import type { AdminSession } from '@/src/lib/auth/session';
import { db, closeDb } from '@/src/db/client';
import { customers } from '@/src/db/schema';
import { loadAdminNavBadges } from '@/src/services/adminNavBadges';
import { getResolvedSidebarLayout } from '@/src/services/sidebarLayouts';
import { getResidentDetail } from '@/src/services/residentAdmin';
import { loadResidentCommandCenter } from '@/src/services/residentCommandCenter';
import { listAssignableBeds } from '@/src/services/tenantAssignment';
import { buildResidentTimeline } from '@/src/services/residentTimeline';
import { listPendingPaymentReviews, resetPaymentReviewFetchCount, getPaymentReviewFetchCount } from '@/src/services/paymentProofQueue';
import { resetAdminDbProfile, snapshotAdminDbProfile } from '@/src/lib/admin/adminDbProfile';

function superAdminSession(): AdminSession {
  return {
    kind: 'admin',
    sessionId: '00000000-0000-4000-8000-000000000099',
    adminId: '00000000-0000-4000-8000-000000000099',
    email: 'profile@local',
    fullName: 'Profile Script',
    role: 'super_admin',
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const ms = Math.round(performance.now() - start);
  console.log(`${label.padEnd(52)} ${String(ms).padStart(6)} ms`);
  return result;
}

async function resolveCustomer(search?: string) {
  if (search?.trim()) {
    const [byName] = await db
      .select({ id: customers.id, fullName: customers.fullName })
      .from(customers)
      .where(ilike(customers.fullName, `%${search.trim()}%`))
      .limit(1);
    if (byName) return byName;
  }
  const [any] = await db
    .select({ id: customers.id, fullName: customers.fullName })
    .from(customers)
    .where(isNull(customers.archivedAt))
    .limit(1);
  if (!any) throw new Error('No resident found');
  return any;
}

async function main() {
  process.env.ADMIN_PROFILE = '1';
  process.env.ADMIN_DB_PROFILE = '1';

  const { loadProductionAuditEnv, requireDatabaseUrl } = await import('@/src/lib/db/loadEnv');
  loadProductionAuditEnv();
  requireDatabaseUrl('profile-resident-profile-open');

  const search = process.argv[2];
  const resident = await resolveCustomer(search);
  console.log(`\nResident: ${resident.fullName} (${resident.id})\n`);
  console.log('Stage'.padEnd(52), 'Time');
  console.log('-'.repeat(60));

  resetAdminDbProfile();
  resetPaymentReviewFetchCount();

  const session = superAdminSession();
  const layoutStart = performance.now();
  await time('layout: loadAdminNavBadges', () => loadAdminNavBadges(session));
  await time('layout: getResolvedSidebarLayout', () => getResolvedSidebarLayout(session));
  const layoutMs = Math.round(performance.now() - layoutStart);

  await time('page: getResidentDetail (gate)', () => getResidentDetail(session, resident.id));
  await time('page: loadResidentCommandCenter (essentials)', () =>
    loadResidentCommandCenter(session, resident.id, {
      includeTimeline: false,
      includeBookingDeposits: false,
    }),
  );
  await time('page: listAssignableBeds (deferred path)', () =>
    listAssignableBeds(session, undefined, { skipDepositQuotes: true }),
  );

  console.log('\n--- deferred sections (isolated) ---\n');
  resetAdminDbProfile();
  await time('  deferred: buildResidentTimeline', () =>
    buildResidentTimeline(session, resident.id, null),
  );
  resetPaymentReviewFetchCount();
  await time('  deferred: listPendingPaymentReviews (should not run)', () =>
    listPendingPaymentReviews(session),
  );
  console.log(`  paymentReviewFetches: ${getPaymentReviewFetchCount()}`);

  const dbSnap = snapshotAdminDbProfile();
  console.log('\n--- summary ---');
  console.log(`layout total (simulated): ${layoutMs} ms`);
  console.log(`db queries (last isolated run): ${dbSnap.queryCount}, db time ~${dbSnap.totalDbMs}ms, dup ${dbSnap.duplicateQueryCount}`);
  console.log('\nDone.\n');

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
