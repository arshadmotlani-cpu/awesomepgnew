/**
 * Profile customer resident portal open path (read-only).
 *
 * Usage:
 *   npx tsx scripts/profile-customer-resident-portal.ts
 *   npx tsx scripts/profile-customer-resident-portal.ts "Waqar Ahmed"
 */
import { performance } from 'node:perf_hooks';
import { eq, ilike, isNull } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import { customers } from '@/src/db/schema';
import { loadResidentAccountContextSafe } from '@/src/services/residentAccountContextSafe';
import {
  loadResidentConciergeTabData,
  loadResidentPaymentsTabData,
  loadResidentProfileTabData,
  loadResidentReferralsTabData,
  loadResidentRequestsTabData,
} from '@/src/services/residentPortalTabData';

function mockSession(customerId: string, email: string, fullName: string) {
  return {
    kind: 'customer' as const,
    sessionId: 'profile-script',
    customerId,
    email,
    fullName,
    phone: '+919999999999',
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
      .select({ id: customers.id, fullName: customers.fullName, email: customers.email })
      .from(customers)
      .where(ilike(customers.fullName, `%${search.trim()}%`))
      .limit(1);
    if (byName) return byName;
  }
  const [any] = await db
    .select({ id: customers.id, fullName: customers.fullName, email: customers.email })
    .from(customers)
    .where(isNull(customers.archivedAt))
    .limit(1);
  if (!any) throw new Error('No resident found');
  return any;
}

async function main() {
  const { loadProductionAuditEnv, requireDatabaseUrl } = await import('@/src/lib/db/loadEnv');
  loadProductionAuditEnv();
  requireDatabaseUrl('profile-customer-resident-portal');

  const search = process.argv[2];
  const resident = await resolveCustomer(search);
  console.log(`\nResident: ${resident.fullName} (${resident.id})\n`);
  console.log('Stage'.padEnd(52), 'Time');
  console.log('-'.repeat(60));

  const contextLoad = await time('loadResidentAccountContextSafe', () =>
    loadResidentAccountContextSafe(resident.id, resident.email),
  );
  if (!contextLoad.ok) {
    console.error('Context load failed:', contextLoad.reason);
    process.exit(1);
  }

  const session = mockSession(resident.id, resident.email, resident.fullName);
  const preloaded = contextLoad.ctx;

  await time('profile tab (lazy)', () =>
    loadResidentProfileTabData({
      preloaded,
      session,
      developerTestMode: false,
      simulatedDurationMode: null,
    }),
  );
  await time('payments tab (lazy)', () =>
    loadResidentPaymentsTabData({ preloaded, session }),
  );
  await time('requests tab (lazy)', () =>
    loadResidentRequestsTabData({
      preloaded,
      session,
      developerTestMode: false,
      simulatedDurationMode: null,
    }),
  );
  await time('referrals tab (lazy)', () => loadResidentReferralsTabData(resident.id));
  await time('concierge tab (lazy)', () =>
    loadResidentConciergeTabData({ preloaded, session }),
  );

  console.log('\nTargets: shell <2s, full profile <5s (per active tab only)\n');
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
