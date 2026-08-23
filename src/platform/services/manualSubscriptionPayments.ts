import { and, desc, eq, sql } from 'drizzle-orm';
import {
  approveDuplicateConfirmMessage,
  approvedTransactionRefConflictMessage,
  assertTransactionRefRequired,
  buildDuplicateFlags,
  isApprovedTransactionRefUniqueViolation,
  labelDuplicateContext,
  normalizeTransactionRef,
  type TransactionRefMatch,
} from '@/src/lib/payments/transactionRefDuplicate';
import {
  platformBillingQrSettings,
  platformOrganizationSubscriptions,
  platformOrganizations,
  platformPlans,
  platformSubscriptionEvents,
  platformSubscriptionPaymentSubmissions,
  type PlatformSubscriptionPaymentStatus,
} from '@/src/platform/db/schema';
import { createPlatformClient } from '@/src/platform/db/client';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';

export type BillingQrSettings = {
  id: string;
  qrImageUrl: string | null;
  upiId: string | null;
  updatedAt: Date;
  updatedByUserId: string | null;
};

export type SubscriptionPaymentSubmission = {
  id: string;
  organizationId: string;
  organizationName?: string;
  planId: string;
  planName?: string;
  amountPaise: number;
  transactionRef: string;
  status: PlatformSubscriptionPaymentStatus;
  possibleDuplicate: boolean;
  duplicateOfIds: string[];
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  duplicateBadge?: string | null;
  defaultRejectNote?: string | null;
  approveConfirmMessage?: string | null;
};

function resolveAmountPaiseFromPlanLimits(limits: Record<string, unknown>): number {
  const amountPaise = limits.amountPaise ?? limits.amount_paise;
  if (typeof amountPaise === 'number' && Number.isFinite(amountPaise) && amountPaise > 0) {
    return Math.round(amountPaise);
  }
  if (typeof amountPaise === 'string' && amountPaise.trim()) {
    const n = Number(amountPaise);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  const rupees = limits.priceMonthly ?? limits.price ?? limits.priceYearly;
  if (typeof rupees === 'number' && Number.isFinite(rupees) && rupees > 0) {
    return Math.round(rupees * 100);
  }
  if (typeof rupees === 'string' && rupees.trim()) {
    const n = Number(rupees);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100);
  }
  throw new Error('Plan amount is not configured (limits.amountPaise or priceMonthly).');
}

export function resolveBillingIntervalFromPlanLimits(
  limits: Record<string, unknown>,
): 'month' | 'year' {
  const raw = limits.billingInterval ?? limits.billing_interval ?? limits.interval;
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (v === 'year' || v === 'yearly' || v === 'annual') return 'year';
  }
  return 'month';
}

export function computeSubscriptionPeriod(
  billingInterval: 'month' | 'year',
  from: Date = new Date(),
): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(from);
  const periodEnd = new Date(from);
  if (billingInterval === 'year') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }
  return { periodStart, periodEnd };
}

export async function getBillingQrSettings(): Promise<BillingQrSettings | null> {
  if (!hasPlatformDatabaseUrl()) return null;
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [row] = await db
      .select()
      .from(platformBillingQrSettings)
      .orderBy(desc(platformBillingQrSettings.updatedAt))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      qrImageUrl: row.qrImageUrl,
      upiId: row.upiId,
      updatedAt: row.updatedAt,
      updatedByUserId: row.updatedByUserId,
    };
  } finally {
    await close();
  }
}

export async function upsertBillingQrSettings(input: {
  qrImageUrl?: string | null;
  upiId?: string | null;
  updatedByUserId?: string | null;
}): Promise<BillingQrSettings> {
  if (!hasPlatformDatabaseUrl()) throw new Error('Platform database is not configured');
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [existing] = await db
      .select()
      .from(platformBillingQrSettings)
      .orderBy(desc(platformBillingQrSettings.updatedAt))
      .limit(1);

    const qrImageUrl =
      input.qrImageUrl !== undefined ? input.qrImageUrl?.trim() || null : existing?.qrImageUrl ?? null;
    const upiId =
      input.upiId !== undefined ? input.upiId?.trim() || null : existing?.upiId ?? null;
    const updatedAt = new Date();
    const updatedByUserId = input.updatedByUserId ?? existing?.updatedByUserId ?? null;

    if (existing) {
      const [row] = await db
        .update(platformBillingQrSettings)
        .set({ qrImageUrl, upiId, updatedAt, updatedByUserId })
        .where(eq(platformBillingQrSettings.id, existing.id))
        .returning();
      return {
        id: row!.id,
        qrImageUrl: row!.qrImageUrl,
        upiId: row!.upiId,
        updatedAt: row!.updatedAt,
        updatedByUserId: row!.updatedByUserId,
      };
    }

    const [row] = await db
      .insert(platformBillingQrSettings)
      .values({ qrImageUrl, upiId, updatedAt, updatedByUserId })
      .returning();
    return {
      id: row!.id,
      qrImageUrl: row!.qrImageUrl,
      upiId: row!.upiId,
      updatedAt: row!.updatedAt,
      updatedByUserId: row!.updatedByUserId,
    };
  } finally {
    await close();
  }
}

async function findTransactionRefMatches(
  db: ReturnType<typeof createPlatformClient>['db'],
  normalizedRef: string,
  excludeId?: string,
): Promise<TransactionRefMatch[]> {
  const rows = await db
    .select({
      id: platformSubscriptionPaymentSubmissions.id,
      status: platformSubscriptionPaymentSubmissions.status,
      submittedAt: platformSubscriptionPaymentSubmissions.submittedAt,
      reviewedAt: platformSubscriptionPaymentSubmissions.reviewedAt,
      organizationId: platformSubscriptionPaymentSubmissions.organizationId,
    })
    .from(platformSubscriptionPaymentSubmissions)
    .where(
      and(
        sql`lower(trim(${platformSubscriptionPaymentSubmissions.transactionRef})) = ${normalizedRef}`,
        excludeId
          ? sql`${platformSubscriptionPaymentSubmissions.id} <> ${excludeId}::uuid`
          : undefined,
      ),
    );
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    submittedAt: r.submittedAt,
    reviewedAt: r.reviewedAt,
    organizationId: r.organizationId,
  }));
}

export async function submitSubscriptionPayment(input: {
  organizationId: string;
  userId: string;
  transactionRef: string;
}): Promise<{ id: string; possibleDuplicate: boolean }> {
  void input.userId;
  if (!hasPlatformDatabaseUrl()) throw new Error('Platform database is not configured');
  const normalizedRef = assertTransactionRefRequired(input.transactionRef);

  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [subscription] = await db
      .select({
        id: platformOrganizationSubscriptions.id,
        planId: platformOrganizationSubscriptions.planId,
      })
      .from(platformOrganizationSubscriptions)
      .where(eq(platformOrganizationSubscriptions.organizationId, input.organizationId))
      .limit(1);
    if (!subscription) throw new Error('Organization subscription not found');

    const [plan] = await db
      .select()
      .from(platformPlans)
      .where(eq(platformPlans.id, subscription.planId))
      .limit(1);
    if (!plan) throw new Error('Plan not found');

    const amountPaise = resolveAmountPaiseFromPlanLimits(
      (plan.limits as Record<string, unknown>) ?? {},
    );
    const matches = await findTransactionRefMatches(db, normalizedRef);
    const flags = buildDuplicateFlags(matches);

    const [row] = await db
      .insert(platformSubscriptionPaymentSubmissions)
      .values({
        organizationId: input.organizationId,
        planId: plan.id,
        amountPaise,
        transactionRef: input.transactionRef.trim(),
        status: 'pending',
        possibleDuplicate: flags.possibleDuplicate,
        duplicateOfIds: flags.duplicateOfIds,
      })
      .returning({
        id: platformSubscriptionPaymentSubmissions.id,
        possibleDuplicate: platformSubscriptionPaymentSubmissions.possibleDuplicate,
      });

    return { id: row!.id, possibleDuplicate: row!.possibleDuplicate };
  } finally {
    await close();
  }
}

function mapSubmissionRow(
  row: typeof platformSubscriptionPaymentSubmissions.$inferSelect & {
    organizationName?: string | null;
    planName?: string | null;
  },
  siblings: TransactionRefMatch[] = [],
): SubscriptionPaymentSubmission {
  const self: TransactionRefMatch = {
    id: row.id,
    status: row.status,
    submittedAt: row.submittedAt,
    reviewedAt: row.reviewedAt,
    organizationId: row.organizationId,
  };
  const label = labelDuplicateContext(self, siblings);
  return {
    id: row.id,
    organizationId: row.organizationId,
    organizationName: row.organizationName ?? undefined,
    planId: row.planId,
    planName: row.planName ?? undefined,
    amountPaise: Number(row.amountPaise),
    transactionRef: row.transactionRef,
    status: row.status,
    possibleDuplicate: row.possibleDuplicate || label.isDuplicate,
    duplicateOfIds: row.duplicateOfIds ?? [],
    submittedAt: row.submittedAt,
    reviewedAt: row.reviewedAt,
    reviewedBy: row.reviewedBy,
    reviewNote: row.reviewNote,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    duplicateBadge: label.badge,
    defaultRejectNote: label.defaultRejectNote,
    approveConfirmMessage: label.primarySibling
      ? approveDuplicateConfirmMessage(label.primarySibling)
      : null,
  };
}

export async function listPendingSubmissions(options?: {
  duplicatesOnly?: boolean;
}): Promise<SubscriptionPaymentSubmission[]> {
  if (!hasPlatformDatabaseUrl()) return [];
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const rows = await db
      .select({
        submission: platformSubscriptionPaymentSubmissions,
        organizationName: platformOrganizations.name,
        planName: platformPlans.name,
      })
      .from(platformSubscriptionPaymentSubmissions)
      .innerJoin(
        platformOrganizations,
        eq(platformSubscriptionPaymentSubmissions.organizationId, platformOrganizations.id),
      )
      .innerJoin(
        platformPlans,
        eq(platformSubscriptionPaymentSubmissions.planId, platformPlans.id),
      )
      .where(
        and(
          eq(platformSubscriptionPaymentSubmissions.status, 'pending'),
          options?.duplicatesOnly
            ? eq(platformSubscriptionPaymentSubmissions.possibleDuplicate, true)
            : undefined,
        ),
      )
      .orderBy(desc(platformSubscriptionPaymentSubmissions.submittedAt));

    const results: SubscriptionPaymentSubmission[] = [];
    for (const row of rows) {
      const normalized = normalizeTransactionRef(row.submission.transactionRef);
      const siblings = normalized
        ? await findTransactionRefMatches(db, normalized, row.submission.id)
        : [];
      results.push(
        mapSubmissionRow(
          {
            ...row.submission,
            organizationName: row.organizationName,
            planName: row.planName,
          },
          siblings,
        ),
      );
    }
    return results;
  } finally {
    await close();
  }
}

export async function listSubmissionsForOrg(
  organizationId: string,
): Promise<SubscriptionPaymentSubmission[]> {
  if (!hasPlatformDatabaseUrl()) return [];
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const rows = await db
      .select()
      .from(platformSubscriptionPaymentSubmissions)
      .where(eq(platformSubscriptionPaymentSubmissions.organizationId, organizationId))
      .orderBy(desc(platformSubscriptionPaymentSubmissions.submittedAt));
    return rows.map((row) => mapSubmissionRow(row));
  } finally {
    await close();
  }
}

export async function approveSubmission(
  id: string,
  reviewerUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasPlatformDatabaseUrl()) return { ok: false, error: 'Platform database is not configured' };
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [submission] = await db
      .select()
      .from(platformSubscriptionPaymentSubmissions)
      .where(eq(platformSubscriptionPaymentSubmissions.id, id))
      .limit(1);
    if (!submission) return { ok: false, error: 'Submission not found' };
    if (submission.status !== 'pending') {
      return { ok: false, error: `Submission is already ${submission.status}` };
    }

    const [plan] = await db
      .select()
      .from(platformPlans)
      .where(eq(platformPlans.id, submission.planId))
      .limit(1);
    if (!plan) return { ok: false, error: 'Plan not found' };

    const billingInterval = resolveBillingIntervalFromPlanLimits(
      (plan.limits as Record<string, unknown>) ?? {},
    );
    const { periodStart, periodEnd } = computeSubscriptionPeriod(billingInterval);
    const now = new Date();

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(platformSubscriptionPaymentSubmissions)
          .set({
            status: 'approved',
            reviewedAt: now,
            reviewedBy: reviewerUserId,
            periodStart,
            periodEnd,
          })
          .where(eq(platformSubscriptionPaymentSubmissions.id, id));

        const [subscription] = await tx
          .select()
          .from(platformOrganizationSubscriptions)
          .where(
            eq(
              platformOrganizationSubscriptions.organizationId,
              submission.organizationId,
            ),
          )
          .limit(1);
        if (!subscription) throw new Error('Organization subscription not found');

        await tx
          .update(platformOrganizationSubscriptions)
          .set({
            status: 'active',
            planId: submission.planId,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            updatedAt: now,
          })
          .where(eq(platformOrganizationSubscriptions.id, subscription.id));

        await tx.insert(platformSubscriptionEvents).values({
          organizationId: submission.organizationId,
          subscriptionId: subscription.id,
          actorUserId: reviewerUserId,
          eventType: 'manual_payment_approved',
          detail: `Manual QR payment approved (submission ${id.slice(0, 8)}, txn ${submission.transactionRef})`,
        });
      });
    } catch (err) {
      if (isApprovedTransactionRefUniqueViolation(err)) {
        return { ok: false, error: approvedTransactionRefConflictMessage() };
      }
      throw err;
    }

    return { ok: true };
  } finally {
    await close();
  }
}

export async function rejectSubmission(
  id: string,
  note: string,
  reviewerUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasPlatformDatabaseUrl()) return { ok: false, error: 'Platform database is not configured' };
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [submission] = await db
      .select()
      .from(platformSubscriptionPaymentSubmissions)
      .where(eq(platformSubscriptionPaymentSubmissions.id, id))
      .limit(1);
    if (!submission) return { ok: false, error: 'Submission not found' };
    if (submission.status !== 'pending') {
      return { ok: false, error: `Submission is already ${submission.status}` };
    }

    await db
      .update(platformSubscriptionPaymentSubmissions)
      .set({
        status: 'rejected',
        reviewNote: note.trim() || 'Rejected',
        reviewedAt: new Date(),
        reviewedBy: reviewerUserId,
      })
      .where(eq(platformSubscriptionPaymentSubmissions.id, id));

    return { ok: true };
  } finally {
    await close();
  }
}

/** Resolve display amount for subscribe UI (null if plan amount missing). */
export async function getSubscribeAmountForOrganization(
  organizationId: string,
): Promise<{ planId: string; planName: string; amountPaise: number; billingInterval: 'month' | 'year' } | null> {
  if (!hasPlatformDatabaseUrl()) return null;
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [subscription] = await db
      .select({ planId: platformOrganizationSubscriptions.planId })
      .from(platformOrganizationSubscriptions)
      .where(eq(platformOrganizationSubscriptions.organizationId, organizationId))
      .limit(1);
    if (!subscription) return null;
    const [plan] = await db
      .select()
      .from(platformPlans)
      .where(eq(platformPlans.id, subscription.planId))
      .limit(1);
    if (!plan) return null;
    const limits = (plan.limits as Record<string, unknown>) ?? {};
    try {
      return {
        planId: plan.id,
        planName: plan.name,
        amountPaise: resolveAmountPaiseFromPlanLimits(limits),
        billingInterval: resolveBillingIntervalFromPlanLimits(limits),
      };
    } catch {
      return {
        planId: plan.id,
        planName: plan.name,
        amountPaise: 0,
        billingInterval: resolveBillingIntervalFromPlanLimits(limits),
      };
    }
  } finally {
    await close();
  }
}
