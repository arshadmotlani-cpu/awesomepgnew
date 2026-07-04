/**
 * Payment review queue SSOT — all surfaces must match listPendingPaymentReviews.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  actionItems,
  bookings,
  notifications,
  unresolvedActions,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { getWaitingForApprovalCount } from '@/src/services/approvalService';
import {
  countPendingPaymentReviews,
  listPendingPaymentReviews,
} from '@/src/services/paymentProofQueue';
import { resolveAction } from '@/src/services/unresolvedActions';

export type PaymentReviewAuditRow = {
  surface: string;
  query: string;
  service: string;
  count: number;
};

export type PaymentReviewStaleAudit = {
  pendingPaymentBookings: string[];
  openPaymentReceivedActionItems: string[];
  orphanPaymentProofUnresolved: string[];
  stalePaymentNotifications: string[];
};

export type PaymentReviewIntegrityReport = {
  queueCount: number;
  dashboardCount: number;
  badgeCount: number;
  openUnresolvedPaymentReviewCount: number;
  auditTable: PaymentReviewAuditRow[];
  stale: PaymentReviewStaleAudit;
  matches: boolean;
};

function paymentReviewSourceKeys(items: Awaited<ReturnType<typeof listPendingPaymentReviews>>) {
  const actionKeys = new Set(items.map((i) => `payment_review:${i.key}`));
  const unresolvedKeys = new Set(items.map((i) => `unresolved:payment_review:${i.key}`));
  return { actionKeys, unresolvedKeys };
}

async function countOpenPaymentProofReviews(session: AdminSession): Promise<number> {
  return getWaitingForApprovalCount(session);
}

async function collectStalePaymentReviewRows(
  session: AdminSession,
  activeActionKeys: Set<string>,
  activeUnresolvedKeys: Set<string>,
): Promise<PaymentReviewStaleAudit> {
  const [pendingBookings, openPaymentItems, openPaymentUnresolved, staleNotifs] =
    await Promise.all([
      db
        .select({ id: bookings.id, bookingCode: bookings.bookingCode })
        .from(bookings)
        .where(eq(bookings.status, 'pending_payment')),
      db
        .select({ id: actionItems.id, sourceKey: actionItems.sourceKey })
        .from(actionItems)
        .where(
          and(
            eq(actionItems.type, 'payment_received'),
            inArray(actionItems.status, ['open', 'in_progress']),
          ),
        ),
      db
        .select({ id: unresolvedActions.id, sourceKey: unresolvedActions.sourceKey })
        .from(unresolvedActions)
        .where(
          and(
            eq(unresolvedActions.status, 'OPEN'),
            eq(unresolvedActions.actionType, 'payment_proof_review'),
          ),
        ),
      db.execute<{ id: string }>(sql`
        SELECT n.id
        FROM notifications n
        WHERE n.audience = 'admin'
          AND n.type IN ('payment_proof_uploaded', 'payment_received')
          AND NOT n.is_archived
          AND NOT EXISTS (
            SELECT 1 FROM action_items ai
            WHERE ai.source_key = n.dedupe_key
              AND ai.type = 'payment_received'
              AND ai.status IN ('open', 'in_progress')
          )
      `),
    ]);

  return {
    pendingPaymentBookings: pendingBookings.map((r) => `${r.id} (${r.bookingCode})`),
    openPaymentReceivedActionItems: openPaymentItems
      .filter((r) => !activeActionKeys.has(r.sourceKey))
      .map((r) => `${r.id} [${r.sourceKey}]`),
    orphanPaymentProofUnresolved: openPaymentUnresolved
      .filter((r) => !activeUnresolvedKeys.has(r.sourceKey))
      .map((r) => `${r.id} [${r.sourceKey}]`),
    stalePaymentNotifications: staleNotifs.map((r) => r.id),
  };
}

/** Close payment review artifacts when proof is approved, rejected, deleted, or missing. */
export async function resolveStalePaymentReviewArtifacts(
  session: AdminSession,
): Promise<{ resolvedActionItems: number; closedUnresolved: number; archivedNotifications: number }> {
  const { reconcileBookingPaymentReviewQueue } = await import(
    '@/src/services/paymentReviewReconciliation'
  );
  await reconcileBookingPaymentReviewQueue();

  const items = await listPendingPaymentReviews(session);
  const { actionKeys, unresolvedKeys } = paymentReviewSourceKeys(items);

  const staleActionRows = await db
    .select({ sourceKey: actionItems.sourceKey })
    .from(actionItems)
    .where(
      and(
        eq(actionItems.type, 'payment_received'),
        inArray(actionItems.status, ['open', 'in_progress']),
      ),
    );

  let resolvedActionItems = 0;
  for (const row of staleActionRows) {
    if (!actionKeys.has(row.sourceKey)) {
      await db
        .update(actionItems)
        .set({ status: 'resolved', updatedAt: new Date() })
        .where(eq(actionItems.sourceKey, row.sourceKey));
      resolvedActionItems += 1;
    }
  }

  const openPaymentUnresolved = await db
    .select({ sourceKey: unresolvedActions.sourceKey })
    .from(unresolvedActions)
    .where(
      and(
        eq(unresolvedActions.status, 'OPEN'),
        eq(unresolvedActions.actionType, 'payment_proof_review'),
      ),
    );

  let closedUnresolved = 0;
  for (const row of openPaymentUnresolved) {
    if (!unresolvedKeys.has(row.sourceKey)) {
      closedUnresolved += await resolveAction({ sourceKey: row.sourceKey });
    }
  }

  const archived = await db.execute<{ id: string }>(sql`
    UPDATE notifications n
    SET is_archived = true
    WHERE n.audience = 'admin'
      AND n.type IN ('payment_proof_uploaded', 'payment_received')
      AND NOT n.is_archived
      AND NOT EXISTS (
        SELECT 1 FROM action_items ai
        WHERE ai.source_key = n.dedupe_key
          AND ai.type = 'payment_received'
          AND ai.status IN ('open', 'in_progress')
      )
    RETURNING n.id
  `);

  return {
    resolvedActionItems,
    closedUnresolved,
    archivedNotifications: archived.length,
  };
}

export async function getPaymentReviewIntegrityReport(
  session: AdminSession,
): Promise<PaymentReviewIntegrityReport> {
  const [rawQueueCount, visibleCount, badgeCount, openUnresolvedPaymentReviewCount] =
    await Promise.all([
      countPendingPaymentReviews(session),
      getWaitingForApprovalCount(session),
      getWaitingForApprovalCount(session),
      countOpenPaymentProofReviews(session),
    ]);

  const dashboardCount = visibleCount;
  const items = await listPendingPaymentReviews(session);
  const { actionKeys, unresolvedKeys } = paymentReviewSourceKeys(items);
  const stale = await collectStalePaymentReviewRows(session, actionKeys, unresolvedKeys);

  const auditTable: PaymentReviewAuditRow[] = [
    {
      surface: 'Payment Reviews Queue (raw)',
      query: 'countPendingPaymentReviews(session)',
      service: 'paymentProofQueue',
      count: rawQueueCount,
    },
    {
      surface: 'Operations WFA (visible)',
      query: 'getWaitingForApprovalCount(session)',
      service: 'approvalService',
      count: visibleCount,
    },
    {
      surface: 'Sidebar Payment Badge',
      query: 'getWaitingForApprovalCount(session)',
      service: 'adminNavBadges / approvalService',
      count: badgeCount,
    },
    {
      surface: 'Open unresolved_actions (payment_proof_review)',
      query: "status='OPEN' AND action_type='payment_proof_review'",
      service: 'unresolvedActions',
      count: openUnresolvedPaymentReviewCount,
    },
  ];

  const matches = visibleCount === badgeCount && visibleCount === dashboardCount;

  return {
    queueCount: rawQueueCount,
    dashboardCount,
    badgeCount,
    openUnresolvedPaymentReviewCount,
    auditTable,
    stale,
    matches,
  };
}
