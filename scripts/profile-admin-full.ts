/**
 * Full admin SSR loader profile — run against a DB with data:
 *
 *   ADMIN_PROFILE=1 DATABASE_URL=... npx tsx scripts/profile-admin-full.ts
 */

import type { AdminSession } from '../src/lib/auth/session';
import { loadAdminNavBadges } from '../src/services/adminNavBadges';
import { loadOverviewContext } from '../src/services/overviewData';
import { loadBillingReconciliationSafe } from '../src/services/billingCycleReconciliation';
import { getResolvedSidebarLayout } from '../src/services/sidebarLayouts';
import { loadUnifiedOperationsQueue } from '../src/services/unifiedOperationsQueue';
import { getPendingPaymentReviewsForRequest } from '../src/services/paymentProofQueue';
import { loadBillingCommandCenterSnapshot } from '../src/services/billingCommandCenter';
import { getRevenueCommandCenterData } from '../src/services/revenueCommandCenter';
import { loadInvoiceOutstandingSnapshot } from '../src/services/financialSummaryService';
import { getDashboardStats } from '../src/db/queries/admin';
import { resetUnifiedQueueBuildCount, getUnifiedQueueBuildCount } from '../src/services/unifiedOperationsQueue';
import { resetPaymentReviewFetchCount, getPaymentReviewFetchCount } from '../src/services/paymentProofQueue';

function superAdminSession(): AdminSession {
  return {
    kind: 'admin',
    sessionId: 'profile-script',
    adminId: 'profile-script',
    email: 'profile@local',
    fullName: 'Profile Script',
    role: 'super_admin',
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    console.log(`${label.padEnd(46)} ${Math.round(performance.now() - start)}ms`);
  }
}

async function main() {
  process.env.ADMIN_PROFILE = '1';
  resetUnifiedQueueBuildCount();
  resetPaymentReviewFetchCount();

  const session = superAdminSession();
  const billingMonth = new Date().toISOString().slice(0, 7) + '-01';

  console.log('\n=== Admin SSR full profile (simulated /admin/overview request) ===\n');

  const totalStart = performance.now();

  await timed('requireAdminSession (mock)', async () => session);

  await timed('layout: loadAdminNavBadges', () => loadAdminNavBadges(session));
  await timed('layout: getResolvedSidebarLayout', () => getResolvedSidebarLayout(session));

  const invoiceSnapshot = await timed('page: loadInvoiceOutstandingSnapshot', () =>
    loadInvoiceOutstandingSnapshot(session),
  );

  await timed('page: loadOverviewContext', () =>
    loadOverviewContext(session, undefined, { syncActions: false }),
  );
  await timed('page: loadBillingReconciliationSafe', () =>
    loadBillingReconciliationSafe(session),
  );

  console.log('\n--- Dedup verification (should be cache hits) ---\n');

  await timed('cache hit: loadAdminNavBadges', () => loadAdminNavBadges(session));
  await timed('cache hit: getPendingPaymentReviewsForRequest', () =>
    getPendingPaymentReviewsForRequest(session),
  );
  await timed('cache hit: loadUnifiedOperationsQueue (filtered)', () =>
    loadUnifiedOperationsQueue(session, 'waiting_for_approval'),
  );

  console.log('\n--- Related admin surfaces ---\n');

  await timed('operations: loadUnifiedOperationsQueue', () =>
    loadUnifiedOperationsQueue(session, null),
  );
  await timed('billing: loadBillingCommandCenterSnapshot', () =>
    loadBillingCommandCenterSnapshot(session, billingMonth),
  );
  await timed('revenue: getRevenueCommandCenterData', () =>
    getRevenueCommandCenterData({ session, billingMonth, invoiceSnapshot }),
  );
  await timed('occupancy: getDashboardStats', async () => {
    const r = await getDashboardStats();
    if (!r.ok) throw new Error(r.error);
    return r.data;
  });

  const totalMs = Math.round(performance.now() - totalStart);

  console.log('\n--- Request dedup counters ---\n');
  console.log(`unifiedOperationsQueue base builds: ${getUnifiedQueueBuildCount()} (expect 1 per simulated overview request)`);
  console.log(`paymentProofQueue fetches:         ${getPaymentReviewFetchCount()} (expect 1 per simulated overview request)`);
  console.log(`\nTotal simulated overview SSR:      ${totalMs}ms\n`);

  if (totalMs > 2000) {
    console.warn(`WARNING: total ${totalMs}ms exceeds 2s target`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
