/**
 * Mirrors open action_items (+ bed assignment) into unresolved_actions SSOT.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { actionItems, unresolvedActions } from '@/src/db/schema';
import type { ActionItemMetadata } from '@/src/lib/actionCenter/constants';
import { isResidentBedAssignmentEligible } from '@/src/lib/residentBedAssignment';
import type { AdminSession } from '@/src/lib/auth/session';
import type { UnresolvedActionType } from '@/src/db/schema/enums';
import { listResidentsForAdmin } from '@/src/services/residentAdmin';
import {
  closeUnresolvedActionsNotInSourceKeys,
  resolveAction,
  upsertOpenAction,
} from '@/src/services/unresolvedActions';

const ACTION_ITEM_TO_UNRESOLVED: Record<string, UnresolvedActionType | null> = {
  kyc_pending: 'kyc_review',
  payment_received: 'payment_proof_review',
  vacating_alert: 'move_out_approval',
  fixed_stay_checkout_due: 'checkout_settlement',
  refund_pending: 'deposit_refund_approval',
  deposit_refund_request: 'deposit_refund_approval',
  refund_request_submitted: 'deposit_refund_approval',
  maintenance_issue: 'maintenance_approval',
  extension_request: 'room_transfer_approval',
  rent_due: 'invoice_review',
  electricity_due: 'invoice_review',
  deposit_collection_due: 'payment_proof_review',
};

function parseEntityFromSourceKey(
  sourceKey: string,
  meta: ActionItemMetadata,
): { entityType: string; entityId: string } {
  const [prefix, id] = sourceKey.split(':');
  if (prefix === 'kyc') return { entityType: 'kyc_submission', entityId: id };
  if (prefix === 'payment_review') return { entityType: 'payment_proof', entityId: id };
  if (prefix === 'vacating') return { entityType: 'vacating_request', entityId: id };
  if (prefix === 'refund') return { entityType: 'booking', entityId: id };
  if (prefix === 'rent') return { entityType: 'rent_invoice', entityId: id };
  if (prefix === 'electricity') return { entityType: 'electricity_invoice', entityId: id };
  if (prefix === 'deposit_due') return { entityType: 'booking', entityId: id };
  if (prefix === 'resident_request') return { entityType: 'resident_request', entityId: id };
  if (prefix === 'maintenance') return { entityType: 'bed', entityId: id };
  if (prefix === 'fixed_stay_checkout') return { entityType: 'booking', entityId: id };
  if (meta.submissionId) return { entityType: 'kyc_submission', entityId: meta.submissionId };
  if (meta.requestId) return { entityType: 'resident_request', entityId: meta.requestId };
  if (meta.bookingId) return { entityType: 'booking', entityId: meta.bookingId };
  return { entityType: 'action_item', entityId: sourceKey };
}

function hrefForAction(
  actionType: UnresolvedActionType,
  meta: ActionItemMetadata & { residentId?: string },
): string {
  switch (actionType) {
    case 'kyc_review':
      return meta.submissionId
        ? `/admin/residents/kyc/${meta.submissionId}`
        : '/admin/residents/kyc';
    case 'payment_proof_review':
      return '/admin/operations/payment-reviews';
    case 'move_out_approval':
      return meta.settlementId
        ? `/admin/checkout-settlements/${meta.settlementId}`
        : '/admin/vacating';
    case 'checkout_settlement':
      return meta.settlementId
        ? `/admin/checkout-settlements/${meta.settlementId}`
        : '/admin/checkout-settlements';
    case 'deposit_refund_approval':
      return meta.bookingId ? `/admin/deposits/${meta.bookingId}` : '/admin/deposits';
    case 'invoice_review':
      return meta.residentId ? `/admin/residents/${meta.residentId}` : '/admin/invoices';
    case 'room_transfer_approval':
      return '/admin/requests';
    case 'maintenance_approval':
      return '/admin/operations/residents';
    case 'bed_assignment':
      return meta.residentId
        ? `/admin/beds?customerId=${meta.residentId}`
        : '/admin/beds';
    default:
      return '/admin/actions';
  }
}

function sessionCanSeePg(session: AdminSession, pgId: string): boolean {
  return (
    session.role === 'super_admin' ||
    session.pgScope.length === 0 ||
    session.pgScope.includes(pgId)
  );
}

async function syncBedAssignmentActions(session: AdminSession): Promise<Set<string>> {
  const keys = new Set<string>();
  const residents = await listResidentsForAdmin(session);

  for (const resident of residents) {
    if (!isResidentBedAssignmentEligible(resident)) continue;
    if (!resident.pgId || !sessionCanSeePg(session, resident.pgId)) continue;

    const sourceKey = `bed_assignment:${resident.id}`;
    keys.add(sourceKey);
    await upsertOpenAction({
      actionType: 'bed_assignment',
      entityType: 'customer',
      entityId: resident.id,
      residentId: resident.id,
      pgId: resident.pgId,
      priority: 'high',
      sourceKey,
      label: `${resident.fullName} — assign bed`,
      href: `/admin/beds?customerId=${resident.id}`,
    });
  }

  return keys;
}

/** Close checkout / refund unresolved rows when settlement is terminal with ₹0 refund. */
export async function resolveTerminalCheckoutUnresolvedActions(): Promise<number> {
  const rows = await db.execute<{ id: string }>(sql`
    UPDATE unresolved_actions ua
    SET status = 'CLOSED', resolved_at = now(), updated_at = now()
    WHERE ua.status = 'OPEN'
      AND ua.action_type IN (
        'deposit_refund_approval',
        'checkout_settlement',
        'move_out_approval'
      )
      AND EXISTS (
        SELECT 1
        FROM checkout_settlements cs
        LEFT JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
        WHERE cs.status IN ('completed', 'refund_paid')
          AND COALESCE(cs.final_refund_paise, 0) <= 0
          AND (
            ua.entity_id = cs.id::text
            OR ua.entity_id = cs.booking_id::text
            OR ua.source_key = 'unresolved:refund:' || cs.booking_id::text
            OR ua.source_key = 'unresolved:vacating:' || vr.id::text
            OR ua.source_key = 'unresolved:fixed_stay_checkout:' || cs.booking_id::text
          )
      )
    RETURNING ua.id
  `);
  return rows.length;
}

/** Drop bed_assignment rows when resident no longer has an active onboarding booking awaiting bed. */
export async function resolveStaleBedAssignmentUnresolvedActions(
  session: AdminSession,
): Promise<number> {
  const residents = await listResidentsForAdmin(session);
  const eligibleIds = new Set(
    residents.filter((r) => isResidentBedAssignmentEligible(r)).map((r) => r.id),
  );

  const openRows = await db
    .select({ sourceKey: unresolvedActions.sourceKey, residentId: unresolvedActions.residentId })
    .from(unresolvedActions)
    .where(
      and(
        eq(unresolvedActions.status, 'OPEN'),
        eq(unresolvedActions.actionType, 'bed_assignment'),
      ),
    );

  let closed = 0;
  for (const row of openRows) {
    if (!row.residentId || !eligibleIds.has(row.residentId)) {
      closed += await resolveAction({ sourceKey: row.sourceKey });
    }
  }
  return closed;
}

export async function syncUnresolvedActionsFromDomain(
  session: AdminSession,
): Promise<{ open: number; closed: number }> {
  const openItems = await db
    .select()
    .from(actionItems)
    .where(inArray(actionItems.status, ['open', 'in_progress']));

  const activeKeys = new Set<string>();

  for (const item of openItems) {
    if (!sessionCanSeePg(session, item.pgId)) continue;

    const actionType = ACTION_ITEM_TO_UNRESOLVED[item.type];
    if (!actionType) continue;

    const meta = (item.metadata ?? {}) as ActionItemMetadata;
    const entity = parseEntityFromSourceKey(item.sourceKey, meta);
    const sourceKey = `unresolved:${item.sourceKey}`;

    activeKeys.add(sourceKey);
    await upsertOpenAction({
      actionType,
      entityType: entity.entityType,
      entityId: entity.entityId,
      residentId: item.residentId,
      pgId: item.pgId,
      priority: item.priority,
      sourceKey,
      label: item.title,
      href: hrefForAction(actionType, {
        ...meta,
        residentId: item.residentId ?? undefined,
      }),
    });
  }

  const bedKeys = await syncBedAssignmentActions(session);
  for (const k of bedKeys) activeKeys.add(k);

  await resolveTerminalCheckoutUnresolvedActions();
  await resolveStaleBedAssignmentUnresolvedActions(session);

  const closed = await closeUnresolvedActionsNotInSourceKeys(activeKeys, session);

  return { open: activeKeys.size, closed };
}

export async function resolveStaleKycActionItems(): Promise<void> {
  await db.execute(sql`
    UPDATE action_items
    SET status = 'resolved', updated_at = now()
    WHERE type = 'kyc_pending'
      AND status IN ('open', 'in_progress')
      AND NOT EXISTS (
        SELECT 1 FROM kyc_submissions ks
        WHERE ks.status = 'pending'
          AND action_items.source_key = 'kyc:' || ks.id::text
      )
  `);
}
