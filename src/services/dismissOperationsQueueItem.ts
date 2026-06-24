/**
 * Super Admin — dismiss stale operational queue rows without touching financial records.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  actionItems,
  adminNotificationStates,
  adminNotifications,
  auditLog,
  unresolvedActions,
} from '@/src/db/schema';
import type { ResidentOpsQueueCategory } from '@/src/lib/residents/residentOperationsDashboard';
import {
  parseDomainIdsFromQueueItemId,
  recordOperationsQueueDismissal,
} from '@/src/services/operationsQueueDismissals';
import { repairOperationsQueueSourceOnDismiss } from '@/src/services/terminalCheckoutOperationsRepair';
import { resolveAction } from '@/src/services/unresolvedActions';
import { refreshAdminNotificationsFromActionItems } from '@/src/services/actionItems';

const AUDIT_MESSAGE = 'Operations item manually dismissed by Super Admin';

export type DismissOperationsQueueInput = {
  adminId: string;
  queueItemId: string;
  customerId: string | null;
  bookingId: string | null;
  vacatingRequestId: string | null;
  category: ResidentOpsQueueCategory;
  residentName: string;
};

export type DismissOperationsQueueResult =
  | {
      ok: true;
      actionItemsClosed: number;
      unresolvedClosed: number;
      notificationsArchived: number;
      domainRepaired: {
        staleSettlementsCompleted: number;
        vacatingCompleted: number;
        bookingsRefundFlagFixed: number;
      };
      dismissalRecorded: boolean;
    }
  | { ok: false; error: string };

function sourceKeysForDismiss(input: DismissOperationsQueueInput): string[] {
  const keys = new Set<string>();
  if (input.vacatingRequestId) {
    keys.add(`vacating:${input.vacatingRequestId}`);
    keys.add(`unresolved:vacating:${input.vacatingRequestId}`);
  }
  if (input.bookingId) {
    keys.add(`refund:${input.bookingId}`);
    keys.add(`unresolved:refund:${input.bookingId}`);
    keys.add(`fixed_stay_checkout:${input.bookingId}`);
    keys.add(`unresolved:fixed_stay_checkout:${input.bookingId}`);
    keys.add(`deposit_due:${input.bookingId}`);
  }
  if (input.customerId) {
    keys.add(`bed_assignment:${input.customerId}`);
  }
  if (input.queueItemId.startsWith('kyc-')) {
    const id = input.queueItemId.replace(/^kyc-/, '');
    keys.add(`kyc:${id}`);
    keys.add(`unresolved:kyc:${id}`);
  }
  if (input.queueItemId.startsWith('proof-')) {
    const id = input.queueItemId.replace(/^proof-/, '');
    keys.add(`payment_review:${id}`);
    keys.add(`unresolved:payment_review:${id}`);
  }
  if (input.queueItemId.startsWith('req-')) {
    const id = input.queueItemId.replace(/^req-[^-]+-/, '');
    keys.add(`resident_request:${id}`);
    keys.add(`unresolved:resident_request:${id}`);
  }
  return [...keys];
}

export async function dismissOperationsQueueItem(
  input: DismissOperationsQueueInput,
): Promise<DismissOperationsQueueResult> {
  if (!input.customerId) {
    return { ok: false, error: 'Cannot dismiss queue item without a resident id.' };
  }

  const parsed = parseDomainIdsFromQueueItemId(input.queueItemId);
  const bookingId = input.bookingId ?? parsed.bookingId;
  const vacatingRequestId = input.vacatingRequestId ?? parsed.vacatingRequestId;
  const settlementId = parsed.settlementId;

  const domainRepaired = await repairOperationsQueueSourceOnDismiss({
    customerId: input.customerId,
    bookingId,
    vacatingRequestId,
    settlementId,
  });

  if (vacatingRequestId) {
    await db.execute(sql`
      UPDATE vacating_requests
      SET
        status = 'completed',
        resolved_at = COALESCE(resolved_at, now()),
        updated_at = now()
      WHERE id = ${vacatingRequestId}::uuid
        AND status IN ('pending', 'approved')
    `);
  }

  if (bookingId && (input.category === 'refund' || input.category === 'move_out')) {
    await db.execute(sql`
      UPDATE bookings
      SET admin_deposit_refund_status = 'refunded', updated_at = now()
      WHERE id = ${bookingId}::uuid
        AND admin_deposit_refund_status = 'pending'
    `);
  }

  await recordOperationsQueueDismissal({
    adminId: input.adminId,
    queueItemId: input.queueItemId,
    category: input.category,
    customerId: input.customerId,
    bookingId,
    vacatingRequestId,
    settlementId,
  });

  const sourceKeys = sourceKeysForDismiss({
    ...input,
    bookingId,
    vacatingRequestId,
  });
  const actionSourceKeys = [...new Set(sourceKeys.filter((k) => !k.startsWith('unresolved:')))];
  const unresolvedSourceKeys = actionSourceKeys.map((k) => `unresolved:${k}`);

  let actionItemsClosed = 0;
  if (actionSourceKeys.length > 0) {
    const resolved = await db
      .update(actionItems)
      .set({ status: 'resolved', updatedAt: new Date() })
      .where(
        and(
          inArray(actionItems.status, ['open', 'in_progress']),
          inArray(actionItems.sourceKey, actionSourceKeys),
        ),
      )
      .returning({ id: actionItems.id });
    actionItemsClosed = resolved.length;
  }

  let unresolvedClosed = 0;
  for (const key of unresolvedSourceKeys) {
    unresolvedClosed += await resolveAction({ sourceKey: key });
  }
  const residentRows = await db
    .select({ sourceKey: unresolvedActions.sourceKey })
    .from(unresolvedActions)
    .where(
      and(
        eq(unresolvedActions.residentId, input.customerId),
        eq(unresolvedActions.status, 'OPEN'),
        inArray(unresolvedActions.actionType, [
          'move_out_approval',
          'checkout_settlement',
          'deposit_refund_approval',
        ]),
      ),
    );
  for (const row of residentRows) {
    unresolvedClosed += await resolveAction({ sourceKey: row.sourceKey });
  }

  let notificationsArchived = 0;
  if (actionSourceKeys.length > 0) {
    const notifRows = await db
      .select({ id: adminNotifications.id })
      .from(adminNotifications)
      .where(inArray(adminNotifications.sourceKey, actionSourceKeys));

    if (notifRows.length > 0) {
      const ids = notifRows.map((n) => n.id);
      await db
        .update(adminNotificationStates)
        .set({ state: 'archived', archivedAt: new Date(), updatedAt: new Date() })
        .where(inArray(adminNotificationStates.notificationId, ids));
      notificationsArchived = notifRows.length;
    }
  }

  const entityId = input.customerId ?? bookingId ?? vacatingRequestId;
  if (entityId) {
    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: input.adminId,
      entity: 'operations_queue',
      entityId,
      action: AUDIT_MESSAGE,
      diff: {
        queueItemId: input.queueItemId,
        category: input.category,
        residentName: input.residentName,
        sourceKeys: actionSourceKeys,
        actionItemsClosed,
        unresolvedClosed,
        notificationsArchived,
        domainRepaired,
        bookingId,
        vacatingRequestId,
        settlementId,
      },
    });
  }

  await refreshAdminNotificationsFromActionItems();

  return {
    ok: true,
    actionItemsClosed,
    unresolvedClosed,
    notificationsArchived,
    domainRepaired,
    dismissalRecorded: true,
  };
}
