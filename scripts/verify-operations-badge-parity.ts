#!/usr/bin/env npx tsx
/** Badge parity check using the same services as sidebar + operations page. */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import { closeDb } from '@/src/db/client';
import type { AdminSession } from '@/src/lib/auth/session';
import { loadAdminNavBadges } from '@/src/services/adminNavBadges';
import { getUnifiedOperationsQueueForBadges } from '@/src/services/unifiedOperationsQueue';

loadProductionAuditEnv();
requireDatabaseUrl('verify-operations-badge-parity.ts');

const CRON: AdminSession = {
  kind: 'admin',
  sessionId: 'badge-parity',
  adminId: 'badge-parity',
  email: 'audit@system',
  fullName: 'Badge Parity',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

async function main() {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('timeout after 90s')), 90_000),
  );

  const work = async () => {
    const [badges, queue] = await Promise.all([
      loadAdminNavBadges(CRON),
      getUnifiedOperationsQueueForBadges(CRON),
    ]);
    const chipSum = queue.filterCounts.reduce((s, c) => s + c.count, 0);
    const nonZero = queue.filterCounts.filter((c) => c.count > 0);
    return { badges, totalCount: queue.totalCount, chipSum, nonZero };
  };

  const result = await Promise.race([work(), timeout]);
  console.log(JSON.stringify(result, null, 2));
  await closeDb();
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
