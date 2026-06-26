/**
 * WhatsApp-style admin notifications: unread vs active tasks.
 *
 * - action_items = active tasks (stay until resolved)
 * - admin_notifications + per-admin state = unread badge counts
 * - One notification per source_key (no duplicate counting)
 */

import { and, desc, eq, inArray, notInArray, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  adminNotificationStates,
  adminNotifications,
  adminUsers,
} from '@/src/db/schema';
import type { ActionItem } from '@/src/db/schema/actionItems';
import type { ActionItemType } from '@/src/db/schema/enums';
import type { ActionItemMetadata } from '@/src/lib/actionCenter/constants';
import { buildActionDeepLink } from '@/src/lib/admin/actionDeepLinks';
import { ACTION_ITEM_GROUP_LABELS } from '@/src/lib/actionCenter/constants';
import type { AdminModule } from '@/src/lib/admin/navigation';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { formatDate } from '@/src/lib/dates';
import type { ActionItemRow } from '@/src/services/actionItems';
import { logger } from '@/src/lib/logger';
import {
  emitAdminNotificationsForActionItem,
  markUserNotificationRead,
  markUserNotificationReadByDedupeKey,
  countUnreadForAdmin as countUnreadUserNotifications,
} from '@/src/services/notificationEngine';

/** NEW = unread badge, SEEN = read history, RESOLVED = archived (task closed). */
export type AdminNotificationState = 'unread' | 'read' | 'archived';

export type AdminNotificationRow = {
  id: string;
  sourceKey: string;
  type: ActionItem['type'];
  typeLabel: string;
  title: string;
  residentName: string | null;
  pgName: string | null;
  detail: string | null;
  href: string;
  state: AdminNotificationState;
  createdAt: Date;
  readAt: Date | null;
  resolvedAt: Date | null;
};

export const NOTIFICATION_TAB_LABELS = {
  unread: 'New',
  read: 'Seen',
  archived: 'Resolved',
} as const;

const TYPE_LABELS: Partial<Record<ActionItem['type'], string>> = {
  vacating_alert: 'New Vacating Notice',
  kyc_pending: 'New KYC Submission',
  rent_due: 'Rent Due',
  electricity_due: 'Electricity Due',
  payment_received: 'Payment Uploaded',
  refund_pending: 'Refund Pending',
  deposit_refund_request: 'Deposit Refund Request',
  extension_request: 'Extension Request',
  deposit_collection_due: 'Deposit Due',
  maintenance_issue: 'Maintenance Issue',
};

function notificationHref(type: ActionItem['type'], meta: ActionItemMetadata, residentId: string | null): string {
  return buildActionDeepLink(type, meta, residentId);
}

function buildDetail(type: ActionItem['type'], meta: ActionItemMetadata, dueDate: string | null): string | null {
  if (type === 'vacating_alert' && dueDate) {
    return `Vacates ${dueDate}`;
  }
  if (type === 'extension_request' && dueDate) {
    return `Requested until ${dueDate}`;
  }
  if (meta.billingMonth) return `Billing ${meta.billingMonth}`;
  if (meta.roomNumber) return `Room ${meta.roomNumber}`;
  return null;
}

function typeToModule(type: ActionItem['type']): AdminModule | 'deposits' {
  switch (type) {
    case 'kyc_pending':
      return 'kyc';
    case 'rent_due':
    case 'electricity_due':
      return 'revenue';
    case 'payment_received':
    case 'fixed_stay_checkout_due':
      return 'operations';
    case 'vacating_alert':
    case 'extension_request':
    case 'maintenance_issue':
      return 'operations';
    case 'refund_pending':
    case 'deposit_refund_request':
    case 'deposit_collection_due':
      return 'deposits';
    default:
      return 'overview';
  }
}

async function adminsForPg(pgId: string): Promise<string[]> {
  const rows = await db
    .select({ id: adminUsers.id, role: adminUsers.role, pgScope: adminUsers.pgScope })
    .from(adminUsers)
    .where(eq(adminUsers.isActive, true));

  return rows
    .filter((a) => adminCanAccessPg({ role: a.role, pgScope: a.pgScope }, pgId))
    .map((a) => a.id);
}

async function seedUnreadForAllActiveAdmins(notificationId: string): Promise<void> {
  const rows = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.isActive, true));

  for (const row of rows) {
    await db
      .insert(adminNotificationStates)
      .values({
        adminId: row.id,
        notificationId,
        state: 'unread',
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }
}

async function seedUnreadForAdmins(notificationId: string, pgId: string) {
  const adminIds = await adminsForPg(pgId);
  if (adminIds.length === 0) return;

  for (const adminId of adminIds) {
    await db
      .insert(adminNotificationStates)
      .values({
        adminId,
        notificationId,
        state: 'unread',
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }
}

function rowFromActionItem(item: ActionItemRow): {
  sourceKey: string;
  type: ActionItem['type'];
  title: string;
  pgId: string;
  residentId: string | null;
  href: string;
  metadata: ActionItemMetadata;
  dueDate: string | null;
} {
  const meta = item.metadata ?? {};
  return {
    sourceKey: item.sourceKey,
    type: item.type,
    title: item.title,
    pgId: item.pgId,
    residentId: item.residentId,
    href: notificationHref(item.type, meta, item.residentId),
    metadata: {
      ...meta,
      residentName: meta.residentName ?? item.residentName ?? undefined,
      pgName: meta.pgName ?? item.pgName,
    },
    dueDate: item.dueDate,
  };
}

/** Sync notifications from open action items — notifications table SSOT only (legacy admin_notifications retired). */
export async function syncAdminNotificationsFromActionItems(
  openItems: ActionItemRow[],
): Promise<void> {
  const activeKeys = new Set<string>();

  for (const item of openItems) {
    activeKeys.add(item.sourceKey);
    const row = rowFromActionItem(item);
    const meta = row.metadata;

    const notifyAllAdmins = meta.notifyAllAdmins === true;
    const adminIds = notifyAllAdmins
      ? (
          await db
            .select({ id: adminUsers.id })
            .from(adminUsers)
            .where(eq(adminUsers.isActive, true))
        ).map((a) => a.id)
      : await adminsForPg(row.pgId);

    const body = buildDetail(row.type, meta, row.dueDate) ?? row.title;
    await emitAdminNotificationsForActionItem({
      adminIds,
      sourceKey: row.sourceKey,
      type: row.type,
      title: TYPE_LABELS[row.type] ?? row.title,
      body,
      href: row.href,
      entityType: row.type,
      entityId: meta.bookingId ?? meta.submissionId ?? meta.settlementId ?? null,
      metadata: meta,
    });
  }

  void activeKeys;
}

function sessionCanSeePg(session: AdminSession, pgId: string): boolean {
  return adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId);
}

export async function listAdminNotifications(
  session: AdminSession,
  filter: 'unread' | 'read' | 'archived' | 'all' = 'unread',
  limit = 50,
): Promise<AdminNotificationRow[]> {
  const rows = await db
    .select({
      id: adminNotifications.id,
      sourceKey: adminNotifications.sourceKey,
      type: adminNotifications.type,
      title: adminNotifications.title,
      pgId: adminNotifications.pgId,
      href: adminNotifications.href,
      metadata: adminNotifications.metadata,
      createdAt: adminNotifications.createdAt,
      state: adminNotificationStates.state,
      readAt: adminNotificationStates.readAt,
      archivedAt: adminNotificationStates.archivedAt,
    })
    .from(adminNotifications)
    .leftJoin(
      adminNotificationStates,
      and(
        eq(adminNotificationStates.notificationId, adminNotifications.id),
        eq(adminNotificationStates.adminId, session.adminId),
      ),
    )
    .orderBy(desc(adminNotifications.createdAt))
    .limit(limit * 2);

  const result: AdminNotificationRow[] = [];

  for (const row of rows) {
    if (!sessionCanSeePg(session, row.pgId)) continue;

    const state = row.state ?? 'unread';
    if (filter === 'unread' && state !== 'unread') continue;
    if (filter === 'read' && state !== 'read') continue;
    if (filter === 'archived' && state !== 'archived') continue;
    if (filter === 'all' && state === 'archived') continue;

    const meta = (row.metadata ?? {}) as ActionItemMetadata & {
      typeLabel?: string;
      detail?: string;
    };

    result.push({
      id: row.id,
      sourceKey: row.sourceKey,
      type: row.type,
      typeLabel: meta.typeLabel ?? TYPE_LABELS[row.type] ?? row.type,
      title: row.title,
      residentName: meta.residentName ?? null,
      pgName: meta.pgName ?? null,
      detail: meta.detail ?? null,
      href: row.href,
      state,
      createdAt: row.createdAt,
      readAt: row.readAt ?? null,
      resolvedAt: row.archivedAt ?? null,
    });

    if (result.length >= limit) break;
  }

  return result;
}

/** Lightweight badge counts — type column only, no full notification hydration. */
export async function listUnreadNotificationTypesForBadges(
  session: AdminSession,
  limit = 300,
): Promise<AdminNotificationRow['type'][]> {
  const rows = await db
    .select({
      type: adminNotifications.type,
      pgId: adminNotifications.pgId,
      state: adminNotificationStates.state,
    })
    .from(adminNotifications)
    .leftJoin(
      adminNotificationStates,
      and(
        eq(adminNotificationStates.notificationId, adminNotifications.id),
        eq(adminNotificationStates.adminId, session.adminId),
      ),
    )
    .orderBy(desc(adminNotifications.createdAt))
    .limit(limit * 2);

  const types: AdminNotificationRow['type'][] = [];
  for (const row of rows) {
    if (!sessionCanSeePg(session, row.pgId)) continue;
    const state = row.state ?? 'unread';
    if (state !== 'unread') continue;
    types.push(row.type);
    if (types.length >= limit) break;
  }
  return types;
}

export async function countUnreadNotifications(session: AdminSession): Promise<number> {
  return countUnreadUserNotifications(session);
}

export async function loadUnreadNavBadges(session: AdminSession) {
  const unread = await listAdminNotifications(session, 'unread', 500);
  const badges: Partial<Record<AdminModule | 'deposits', number>> = {};

  for (const n of unread) {
    const mod = typeToModule(n.type);
    badges[mod] = (badges[mod] ?? 0) + 1;
    if (mod === 'deposits') {
      badges.residents = (badges.residents ?? 0) + 1;
    }
    if (mod === 'operations' && n.type === 'extension_request') {
      badges.residents = (badges.residents ?? 0) + 1;
    }
  }

  badges.overview = unread.length;
  return badges;
}

export async function markNotificationRead(
  session: AdminSession,
  input: { notificationId?: string; sourceKey?: string; readKey?: string },
): Promise<void> {
  if (input.notificationId) {
    logger.info('[notifications] mark read', {
      reason: 'notificationId',
      notificationId: input.notificationId,
      adminId: session.adminId,
    });
    await markUserNotificationRead('admin', session.adminId, input.notificationId);
    return;
  }

  const dedupeKey =
    input.sourceKey ??
    (input.readKey ? resolveReadKeyToSourceKey(input.readKey.trim()) : null);

  if (dedupeKey) {
    logger.info('[notifications] mark read', {
      reason: 'dedupeKey',
      dedupeKey,
      adminId: session.adminId,
    });
    await markUserNotificationReadByDedupeKey('admin', session.adminId, dedupeKey);
  }

  const [legacyRow] = dedupeKey
    ? await db
        .select({ id: adminNotifications.id, pgId: adminNotifications.pgId })
        .from(adminNotifications)
        .where(eq(adminNotifications.sourceKey, dedupeKey))
        .limit(1)
    : [];

  if (!legacyRow || !sessionCanSeePg(session, legacyRow.pgId)) return;

  await db
    .insert(adminNotificationStates)
    .values({
      adminId: session.adminId,
      notificationId: legacyRow.id,
      state: 'read',
      readAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [adminNotificationStates.adminId, adminNotificationStates.notificationId],
      set: {
        state: 'read',
        readAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

export async function archiveNotification(
  session: AdminSession,
  notificationId: string,
): Promise<void> {
  await db
    .insert(adminNotificationStates)
    .values({
      adminId: session.adminId,
      notificationId,
      state: 'archived',
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [adminNotificationStates.adminId, adminNotificationStates.notificationId],
      set: {
        state: 'archived',
        archivedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

function resolveReadKeyToSourceKey(readKey: string): string | null {
  if (readKey.startsWith('vacating:')) return readKey;
  if (readKey.startsWith('kyc:')) return readKey;
  if (readKey.startsWith('request:')) {
    return `resident_request:${readKey.slice(8)}`;
  }
  if (readKey.startsWith('refund:')) return readKey;
  if (readKey.startsWith('deposit:')) {
    const bookingId = readKey.slice(8);
    return `refund:${bookingId}`;
  }
  if (readKey.startsWith('payment_review:')) return readKey;
  if (readKey.startsWith('deposit_due:')) return readKey;
  return null;
}

const PATH_NOTIFICATION_TYPES: Array<{ prefix: string; types: ActionItemType[] }> = [
  { prefix: '/admin/vacating', types: ['vacating_alert'] },
  { prefix: '/admin/residents/kyc', types: ['kyc_pending'] },
  { prefix: '/admin/collections', types: ['rent_due', 'electricity_due', 'payment_received'] },
  { prefix: '/admin/revenue', types: ['rent_due', 'electricity_due', 'payment_received'] },
  {
    prefix: '/admin/deposits',
    types: [
      'refund_pending',
      'deposit_refund_request',
      'refund_request_submitted',
      'deposit_collection_due',
    ],
  },
  {
    prefix: '/admin/requests',
    types: ['deposit_refund_request', 'refund_request_submitted', 'extension_request'],
  },
  {
    prefix: '/admin/operations/payment-reviews',
    types: ['payment_received'],
  },
  {
    prefix: '/admin/operations',
    types: [
      'vacating_alert',
      'fixed_stay_checkout_due',
      'extension_request',
      'maintenance_issue',
    ],
  },
  {
    prefix: '/admin/checkout-settlements',
    types: ['fixed_stay_checkout_due', 'refund_request_submitted', 'vacating_alert'],
  },
  { prefix: '/admin/electricity', types: ['electricity_due'] },
  { prefix: '/admin/rent', types: ['rent_due'] },
  { prefix: '/admin/payments', types: ['payment_received'] },
];

function typesForAdminPath(pathname: string): ActionItemType[] {
  for (const row of PATH_NOTIFICATION_TYPES) {
    if (pathname === row.prefix || pathname.startsWith(`${row.prefix}/`)) {
      return row.types;
    }
  }
  return [];
}

/** @deprecated Do not call on page load — marks many notifications read without user action. */
export async function markNotificationsSeenForTypes(
  session: AdminSession,
  types: ActionItemType[],
): Promise<number> {
  if (types.length === 0) return 0;

  logger.warn('[notifications] bulk markNotificationsSeenForTypes invoked', {
    types,
    adminId: session.adminId,
  });

  const unread = await listAdminNotifications(session, 'unread', 500);
  const toMark = unread.filter((n) => types.includes(n.type));
  for (const n of toMark) {
    await markNotificationRead(session, { notificationId: n.id });
  }
  return toMark.length;
}

/** @deprecated Do not call on page load — use explicit read params or inbox dismiss instead. */
export async function markNotificationsSeenForPath(
  session: AdminSession,
  pathname: string,
): Promise<number> {
  return markNotificationsSeenForTypes(session, typesForAdminPath(pathname));
}

/** Call from admin pages when ?read= query param is present. */
export async function processNotificationReadParam(
  session: AdminSession,
  readParam: string | undefined,
): Promise<void> {
  if (!readParam?.trim()) return;
  await markNotificationRead(session, { readKey: decodeURIComponent(readParam.trim()) });
}

export function formatNotificationAge(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(date);
}
