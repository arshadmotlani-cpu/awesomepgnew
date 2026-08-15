/**
 * Deep scan: every Operations page prop destined for client components.
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
import { buildOperationsAttentionCards } from '@/src/lib/operations/operationsAttentionCards';

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

function scan(label: string, value: unknown): void {
  const issues = findNonSerializable(value);
  console.log(label, { issueCount: issues.length, sample: issues.slice(0, 15) });
  if (issues.length > 0) {
    throw new Error(`${label}: ${issues.slice(0, 8).join(', ')}`);
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
  const data = await loadUnifiedOperationsQueue(session, filter, null);
  const dateChangeBundle = await loadOperationsDateChangeBundle(session);
  const activityGroups = groupOperationsActivityByDay(await loadOperationsActivityFeed(session));
  const attentionCards = buildOperationsAttentionCards(
    data.filterCounts,
    dateChangeBundle.dateChangeCount,
  );
  const recentRejections = await listRecentPaymentProofRejectionsForAdmin(session, 40);

  // Props → OperationsAttentionBoard (client)
  scan('attentionBoard', {
    totalCount: data.totalCount,
    cards: attentionCards,
    pendingDateChanges: dateChangeBundle.pendingDateChanges,
    dateChangeContextByRequestId: dateChangeBundle.dateChangeContextByRequestId,
    statementDocumentByRequestId: dateChangeBundle.statementDocumentByRequestId,
    focusRequestId: null,
    hideDateChangePanels: filter === 'vacating_requests',
  });

  // Props → OperationsActivityFeed (client)
  scan('activityFeed', { groups: activityGroups });

  // Props → OperationsMasterQueue children (client)
  scan('waitingForApprovalTable', { items: data.paymentReviews });
  scan('rejectedPayments', { rows: recentRejections });

  // Deep scan each payment review item
  for (let i = 0; i < data.paymentReviews.length; i++) {
    scan(`paymentReview[${i}]`, data.paymentReviews[i]);
  }

  console.log('PASS all client-bound Operations props are JSON-safe');
}

main()
  .then(() => closeDb())
  .catch((err) => {
    console.error('FAIL', err);
    closeDb().finally(() => process.exit(1));
  });
