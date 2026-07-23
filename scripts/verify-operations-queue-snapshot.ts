#!/usr/bin/env npx tsx
/** Fast queue snapshot — single build, no per-filter reload. */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import { closeDb } from '@/src/db/client';
import type { AdminSession } from '@/src/lib/auth/session';
import { loadAdminNavBadges } from '@/src/services/adminNavBadges';
import { getUnifiedOperationsQueueForRequest } from '@/src/services/unifiedOperationsQueue';

loadProductionAuditEnv();
requireDatabaseUrl('verify-operations-queue-snapshot.ts');

const CRON: AdminSession = {
  kind: 'admin',
  sessionId: 'snap',
  adminId: 'snap',
  email: 'audit@system',
  fullName: 'Snap',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

async function main() {
  const [queue, badges] = await Promise.all([
    getUnifiedOperationsQueueForRequest(CRON, null),
    loadAdminNavBadges(CRON),
  ]);
  const chipSum = queue.filterCounts.reduce((s, c) => s + c.count, 0);
  console.log(JSON.stringify({
    totalCount: queue.totalCount,
    chipSum,
    badgesOperations: badges.operations ?? 0,
    badgesPayments: badges.payments ?? 0,
    filterCounts: Object.fromEntries(queue.filterCounts.map((c) => [c.id, c.count])),
    parityOk: queue.totalCount === chipSum && (badges.operations ?? 0) === queue.totalCount,
  }, null, 2));
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
