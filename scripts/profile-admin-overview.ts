/**
 * Profile admin overview SSR loaders — run with production DATABASE_URL.
 *
 *   ADMIN_PROFILE=1 npx tsx scripts/profile-admin-overview.ts
 */

import type { AdminSession } from '../src/lib/auth/session';
import { loadAdminNavBadges } from '../src/services/adminNavBadges';
import { loadOverviewContext } from '../src/services/overviewData';
import { loadBillingReconciliationSafe } from '../src/services/billingCycleReconciliation';
import { getResolvedSidebarLayout } from '../src/services/sidebarLayouts';

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
    console.log(`${label.padEnd(42)} ${Math.round(performance.now() - start)}ms`);
  }
}

async function main() {
  process.env.ADMIN_PROFILE = '1';
  const session = superAdminSession();

  console.log('\n=== Admin overview SSR profile ===\n');

  await timed('layout: loadAdminNavBadges', () => loadAdminNavBadges(session));
  await timed('layout: getResolvedSidebarLayout', () => getResolvedSidebarLayout(session));

  await timed('page: loadOverviewContext', () =>
    loadOverviewContext(session, undefined, { syncActions: false }),
  );
  await timed('page: loadBillingReconciliationSafe', () =>
    loadBillingReconciliationSafe(session),
  );

  console.log('\n=== With syncActionItems (old overview default) ===\n');
  await timed('page: loadOverviewContext+sync', () =>
    loadOverviewContext(session, undefined, { syncActions: true }),
  );

  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
