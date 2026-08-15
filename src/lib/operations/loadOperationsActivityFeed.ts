import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { actionItems, auditLog, notifications } from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { vacatingDateChangeOperationsHref } from '@/src/lib/operations/operationsFilterLinks';
import { formatDate } from '@/src/lib/dates';

export type OperationsActivityItem = {
  id: string;
  label: string;
  detail?: string;
  occurredAt: Date;
  statusBadge?: string;
  href?: string;
};

const AUDIT_ENTITIES = [
  'vacating_date_change_request',
  'vacating_request',
  'checkout_settlements',
] as const;

function labelAuditActivity(entity: string, action: string): string | null {
  if (entity === 'vacating_date_change_request') {
    if (action === 'submitted') return 'Move-out date change requested';
    if (action === 'approved') return 'Move-out date change approved';
    if (action === 'rejected') return 'Move-out date change rejected';
    if (action === 'cancelled') return 'Move-out date change cancelled';
  }
  if (entity === 'vacating_request') {
    if (action === 'submit') return 'Move-out notice submitted';
    if (action === 'approve') return 'Move-out notice approved';
    if (action === 'reject') return 'Move-out notice rejected';
    if (action === 'completed') return 'Move-out completed';
  }
  if (entity === 'checkout_settlements') {
    if (action.includes('meter') || action.includes('electricity')) return 'Checkout electricity updated';
    if (action.includes('refund')) return 'Checkout refund updated';
    return 'Checkout settlement updated';
  }
  return null;
}

function auditStatusBadge(action: string): string | undefined {
  if (action === 'approved' || action === 'completed') return 'Approved';
  if (action === 'rejected') return 'Rejected';
  if (action === 'cancelled') return 'Cancelled';
  if (action === 'submitted' || action === 'submit') return 'Pending';
  return undefined;
}

function labelResolvedActionItem(type: string): string | null {
  switch (type) {
    case 'vacating_date_change':
      return 'Move-out date change resolved';
    case 'vacating_alert':
      return 'Move-out notice resolved';
    case 'payment_received':
      return 'Payment review resolved';
    case 'refund_pending':
      return 'Refund task resolved';
    case 'kyc_pending':
      return 'KYC task resolved';
    default:
      return null;
  }
}

function actionItemHref(
  type: string,
  metadata: Record<string, unknown> | null,
): string | undefined {
  if (type === 'vacating_date_change' && metadata?.dateChangeRequestId) {
    return vacatingDateChangeOperationsHref(String(metadata.dateChangeRequestId));
  }
  if (type === 'vacating_alert' && metadata?.vacatingRequestId) {
    return `/admin/vacating?read=${encodeURIComponent(`vacating:${metadata.vacatingRequestId}`)}`;
  }
  if (metadata?.bookingId) {
    return `/admin/bookings/${metadata.bookingId}`;
  }
  return '/admin/operations';
}

/** Recent operational events for the Operations command center (last 7 days). */
export async function loadOperationsActivityFeed(
  session: AdminSession,
  limit = 40,
): Promise<OperationsActivityItem[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const auditRows = await db
    .select({
      id: auditLog.id,
      entity: auditLog.entity,
      action: auditLog.action,
      createdAt: auditLog.createdAt,
      diff: auditLog.diff,
    })
    .from(auditLog)
    .where(
      and(
        inArray(auditLog.entity, [...AUDIT_ENTITIES]),
        gte(auditLog.createdAt, since),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(60);

  const notificationRows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      deepLink: notifications.deepLink,
      createdAt: notifications.createdAt,
      isRead: notifications.isRead,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.audience, 'admin'),
        eq(notifications.userId, session.adminId),
        gte(notifications.createdAt, since),
        eq(notifications.isArchived, false),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(40);

  const resolvedItems = await db
    .select({
      id: actionItems.id,
      type: actionItems.type,
      title: actionItems.title,
      pgId: actionItems.pgId,
      metadata: actionItems.metadata,
      updatedAt: actionItems.updatedAt,
    })
    .from(actionItems)
    .where(
      and(
        eq(actionItems.status, 'resolved'),
        gte(actionItems.updatedAt, since),
        inArray(actionItems.type, [
          'vacating_date_change',
          'vacating_alert',
          'payment_received',
          'refund_pending',
          'kyc_pending',
        ]),
      ),
    )
    .orderBy(desc(actionItems.updatedAt))
    .limit(40);

  const merged: OperationsActivityItem[] = [];

  for (const row of auditRows) {
    const label = labelAuditActivity(row.entity, row.action);
    if (!label) continue;
    const diff = row.diff as Record<string, unknown> | null;
    const residentName =
      typeof diff?.residentName === 'string' ? diff.residentName : undefined;
    merged.push({
      id: `audit:${row.id}`,
      label: residentName ? `${label} · ${residentName}` : label,
      detail: row.entity.replace(/_/g, ' '),
      occurredAt: row.createdAt,
      statusBadge: auditStatusBadge(row.action),
    });
  }

  for (const row of notificationRows) {
    merged.push({
      id: `notif:${row.id}`,
      label: row.title,
      detail: row.body.split('\n')[0] ?? undefined,
      occurredAt: row.createdAt,
      statusBadge: row.isRead ? 'Seen' : 'New',
      href: row.deepLink,
    });
  }

  for (const row of resolvedItems) {
    if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pgId)) {
      continue;
    }
    const label = labelResolvedActionItem(row.type) ?? row.title;
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const residentName =
      typeof meta.residentName === 'string' ? meta.residentName : undefined;
    merged.push({
      id: `action:${row.id}`,
      label: residentName ? `${label} · ${residentName}` : label,
      detail: row.title,
      occurredAt: row.updatedAt,
      statusBadge: 'Resolved',
      href: actionItemHref(row.type, meta),
    });
  }

  merged.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  return merged.slice(0, limit);
}

export function groupOperationsActivityByDay(
  items: OperationsActivityItem[],
): Array<{ dayLabel: string; items: OperationsActivityItem[] }> {
  const groups = new Map<string, OperationsActivityItem[]>();
  const today = formatDate(new Date());
  const yesterday = formatDate(new Date(Date.now() - 86400000));

  for (const item of items) {
    const dayKey = formatDate(item.occurredAt);
    const dayLabel =
      dayKey === today ? 'Today' : dayKey === yesterday ? 'Yesterday' : dayKey;
    const bucket = groups.get(dayLabel) ?? [];
    bucket.push(item);
    groups.set(dayLabel, bucket);
  }

  return [...groups.entries()].map(([dayLabel, groupItems]) => ({
    dayLabel,
    items: groupItems,
  }));
}
