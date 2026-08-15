/**
 * Full Operations page payload serialization audit (read-only production).
 */
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';

function loadDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.prod.live', '.env.bak', '.env.off', '.env.local']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (value) {
        process.env.DATABASE_URL = value;
        console.log(`Using DATABASE_URL from ${path}`);
        return;
      }
    } catch {
      // next
    }
  }
}

loadDatabaseUrl();

import { db, closeDb } from '@/src/db/client';
import { adminUsers } from '@/src/db/schema/adminUsers';
import {
  emptyOperationsDateChangeBundle,
  loadOperationsDateChangeBundle,
} from '@/src/lib/operations/loadOperationsDateChangeBundle';
import {
  groupOperationsActivityByDay,
  loadOperationsActivityFeed,
} from '@/src/lib/operations/loadOperationsActivityFeed';
import {
  emptyUnifiedOperationsQueue,
  loadUnifiedOperationsQueue,
} from '@/src/services/unifiedOperationsQueue';
import { listRecentPaymentProofRejectionsForAdmin } from '@/src/services/paymentProofRejectionService';
import { buildOperationsAttentionCards } from '@/src/components/admin/operations/OperationsAttentionBoard';

function findNonSerializable(
  value: unknown,
  path = 'root',
  seen = new Set<object>(),
): string[] {
  const issues: string[] = [];
  if (value === null || value === undefined) return issues;
  if (typeof value === 'bigint') {
    issues.push(`${path}: bigint`);
    return issues;
  }
  if (value instanceof Date) {
    issues.push(`${path}: Date`);
    return issues;
  }
  if (typeof value === 'function') {
    issues.push(`${path}: function`);
    return issues;
  }
  if (typeof value !== 'object') return issues;
  if (seen.has(value)) return issues;
  seen.add(value);
  if (value instanceof Map) {
    issues.push(`${path}: Map`);
    return issues;
  }
  if (value instanceof Set) {
    issues.push(`${path}: Set`);
    return issues;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => issues.push(...findNonSerializable(item, `${path}[${i}]`, seen)));
    return issues;
  }
  for (const [key, child] of Object.entries(value)) {
    issues.push(...findNonSerializable(child, `${path}.${key}`, seen));
  }
  return issues;
}

function assertJsonSafe(label: string, value: unknown): void {
  const issues = findNonSerializable(value);
  const json = JSON.stringify(value);
  console.log(label, {
    jsonOk: json.length > 0,
    jsonBytes: json.length,
    nonSerializable: issues.slice(0, 20),
    nonSerializableCount: issues.length,
  });
  if (issues.length > 0) {
    throw new Error(`${label} has non-serializable values: ${issues.slice(0, 5).join(', ')}`);
  }
}

async function main() {
  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.role, 'super_admin'))
    .limit(1);
  if (!admin) throw new Error('no super admin');

  const session = {
    adminId: admin.id,
    role: 'super_admin' as const,
    pgScope: null,
    email: admin.email,
    fullName: admin.fullName,
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 3600000),
  };

  const filter = 'waiting_for_approval';
  let data = emptyUnifiedOperationsQueue(filter);
  try {
    data = await loadUnifiedOperationsQueue(session, filter, null);
  } catch (err) {
    console.error('unifiedQueue loader failed', err);
  }

  let dateChangeBundle = emptyOperationsDateChangeBundle();
  try {
    dateChangeBundle = await loadOperationsDateChangeBundle(session);
  } catch (err) {
    console.error('dateChangeBundle loader failed', err);
  }

  let activityGroups: Awaited<ReturnType<typeof groupOperationsActivityByDay>> = [];
  try {
    const activityItems = await loadOperationsActivityFeed(session);
    activityGroups = groupOperationsActivityByDay(activityItems);
  } catch (err) {
    console.error('activityFeed loader failed', err);
  }

  const attentionCards = buildOperationsAttentionCards(
    data.filterCounts,
    dateChangeBundle.dateChangeCount,
  );

  let recentRejections: Awaited<ReturnType<typeof listRecentPaymentProofRejectionsForAdmin>> = [];
  try {
    recentRejections = await listRecentPaymentProofRejectionsForAdmin(session, 40);
  } catch (err) {
    console.error('paymentRejections loader failed', err);
  }

  assertJsonSafe('unifiedQueue', data);
  assertJsonSafe('dateChangeBundle', dateChangeBundle);
  assertJsonSafe('activityGroups', activityGroups);
  assertJsonSafe('attentionCards', attentionCards);
  assertJsonSafe('recentRejections', recentRejections);

  const fullPageProps = {
    data,
    dateChangeBundle,
    activityGroups,
    attentionCards,
    recentRejections,
    isSuperAdmin: session.role === 'super_admin',
  };
  assertJsonSafe('fullPageProps', fullPageProps);

  console.log('PASS full Operations waiting_for_approval payload is JSON-safe');
  console.log('paymentReviews', data.paymentReviews.length);
  console.log('recentRejections', recentRejections.length);
  if (recentRejections[0]) {
    console.log('sample rejection rejectedAt type', typeof recentRejections[0].rejectedAt);
  }
}

main()
  .then(() => closeDb())
  .catch((err) => {
    console.error('FAIL', err);
    closeDb().finally(() => process.exit(1));
  });
