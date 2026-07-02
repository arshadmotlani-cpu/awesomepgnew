/**
 * Safe repair actions for resident auth integrity issues.
 * Never deletes booking history — archives duplicate incomplete rows only.
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bookings, customers } from '@/src/db/schema';
import { archiveStaleCustomerForRecovery } from '@/src/lib/auth/customer';
import type { AuthIntegrityIssue } from '@/src/services/authIntegrityCheck';

export type AuthRepairAction = {
  checkType: string;
  issue: AuthIntegrityIssue;
  action: 'repaired' | 'skipped' | 'needs_manual_review';
  detail: string;
};

async function logAuthRepair(entityId: string, action: string, diff: Record<string, unknown>) {
  await db.insert(auditLog).values({
    actorType: 'system',
    entity: 'customer_auth',
    entityId,
    action,
    diff,
  });
}

/** Pick canonical customer: prefer row with bookings + password. */
async function pickCanonicalCustomerId(ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  const rows = await db.execute<{
    id: string;
    booking_count: number;
    has_password: boolean;
    created_at: string;
  }>(sql`
    SELECT c.id,
           (SELECT count(*)::int FROM bookings bk WHERE bk.customer_id = c.id) AS booking_count,
           (c.password_hash IS NOT NULL) AS has_password,
           c.created_at::text
    FROM customers c
    WHERE c.id IN (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})
    ORDER BY
      (SELECT count(*) FROM bookings bk WHERE bk.customer_id = c.id) DESC,
      (c.password_hash IS NOT NULL) DESC,
      c.created_at ASC
    LIMIT 1
  `);
  return rows[0]?.id ?? ids[0];
}

async function repairDuplicateIdentity(
  issue: AuthIntegrityIssue,
  dryRun: boolean,
): Promise<AuthRepairAction> {
  const ids = (issue.metadata?.customerIds as string[] | undefined) ?? [
    issue.customerId,
    issue.relatedCustomerId,
  ].filter(Boolean) as string[];

  if (ids.length < 2) {
    return { checkType: issue.checkType, issue, action: 'skipped', detail: 'Need 2+ customer ids' };
  }

  const canonicalId = await pickCanonicalCustomerId(ids);
  if (!canonicalId) {
    return { checkType: issue.checkType, issue, action: 'skipped', detail: 'No canonical id' };
  }

  const duplicates = ids.filter((id) => id !== canonicalId);

  if (dryRun) {
    return {
      checkType: issue.checkType,
      issue,
      action: 'repaired',
      detail: `Would keep ${canonicalId}, archive ${duplicates.join(', ')}, reassign bookings`,
    };
  }

  for (const dupId of duplicates) {
    const [dup] = await db.select().from(customers).where(eq(customers.id, dupId)).limit(1);
    if (!dup) continue;

    await db
      .update(bookings)
      .set({ customerId: canonicalId, updatedAt: new Date() })
      .where(eq(bookings.customerId, dupId));

    await archiveStaleCustomerForRecovery({ id: dup.id, email: dup.email });
    await logAuthRepair(canonicalId, 'auth_integrity_merge_duplicate', {
      archivedCustomerId: dupId,
      checkType: issue.checkType,
    });
  }

  return {
    checkType: issue.checkType,
    issue,
    action: 'repaired',
    detail: `Merged into ${canonicalId}, archived ${duplicates.length} duplicate(s)`,
  };
}

export async function repairAuthIntegrityIssue(
  issue: AuthIntegrityIssue,
  opts?: { dryRun?: boolean },
): Promise<AuthRepairAction> {
  const dryRun = opts?.dryRun ?? false;

  switch (issue.checkType) {
    case 'DUPLICATE_PHONE':
    case 'DUPLICATE_EMAIL':
    case 'PHONE_LOOKUP_EMAIL_MISMATCH':
      return repairDuplicateIdentity(issue, dryRun);
    default:
      return {
        checkType: issue.checkType,
        issue,
        action: 'needs_manual_review',
        detail: 'No automated repair for this issue class',
      };
  }
}

export async function repairAuthIntegrityIssues(opts?: {
  dryRun?: boolean;
  report?: Awaited<ReturnType<typeof import('./authIntegrityCheck').runAuthIntegrityCheck>>;
}) {
  const { runAuthIntegrityCheck } = await import('./authIntegrityCheck');
  const dryRun = opts?.dryRun ?? false;
  const before = opts?.report ?? (await runAuthIntegrityCheck());
  const actions: AuthRepairAction[] = [];

  for (const issue of before.issues) {
    if (!issue.autoRepairable) {
      actions.push({
        checkType: issue.checkType,
        issue,
        action: 'needs_manual_review',
        detail: 'Not auto-repairable',
      });
      continue;
    }
    actions.push(await repairAuthIntegrityIssue(issue, { dryRun }));
  }

  const after = dryRun ? null : await runAuthIntegrityCheck();
  return {
    dryRun,
    before,
    after,
    actions,
    repairedCount: actions.filter((a) => a.action === 'repaired').length,
    manualReviewCount: actions.filter((a) => a.action === 'needs_manual_review').length,
  };
}
