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
import type { ActionItemMetadata } from '@/src/lib/actionCenter/constants';
import { ACTION_ITEM_GROUP_LABELS } from '@/src/lib/actionCenter/constants';
import type { AdminModule } from '@/src/lib/admin/navigation';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { formatDate } from '@/src/lib/dates';
import type { ActionItemRow } from '@/src/services/actionItems';

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
  state: 'unread' | 'read' | 'archived';
  createdAt: Date;
};

const TYPE_LABELS: Partial<Record<ActionItem['type'], string>> = {
  vacating_alert: 'New Vacating Notice',
  kyc_pending: 'New KYC Submission',
  rent_due: 'Rent Due',
  electricity_due: 'Electricity Due',
  payment_received: 'Payment Uploaded',
  refund_pending: 'Refund Pending',
  deposit_refund_request: 'Deposit Refund Request',
  extension_request: 'Extension Request',
  maintenance_issue: 'Maintenance Issue',
};

function notificationHref(type: ActionItem['type'], meta: ActionItemMetadata, residentId: string | null): string {
  if (type === 'vacating_alert' && meta.vacatingRequestId) {
    return `/admin/vacating?read=${encodeURIComponent(`vacating:${meta.vacatingRequestId}`)}`;
  }
  if (type === 'kyc_pending' && meta.submissionId) {
    return `/admin/residents/kyc/${meta.submissionId}?read=${encodeURIComponent(`kyc:${meta.submissionId}`)}`;
  }
  if (type === 'deposit_refund_request' || type === 'extension_request') {
    if (meta.requestId) {
      return `/admin/requests?read=${encodeURIComponent(`request:${meta.requestId}`)}`;
    }
  }
  if (meta.bookingId && (type === 'refund_pending' || type === 'deposit_refund_request')) {
    return `/admin/deposits/${meta.bookingId}?read=${encodeURIComponent(`refund:${meta.bookingId}`)}`;
  }
  if (residentId) {
    return `/admin/residents/${residentId}?read=${encodeURIComponent(`resident:${residentId}:${type}`)}`;
  }
  if (type === 'payment_received') return '/admin/collections?tab=payments';
  if (type === 'rent_due') return '/admin/collections?tab=rent';
  if (type === 'electricity_due') return '/admin/collections?tab=electricity';
  return '/admin/overview';
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
    case 'payment_received':
      return 'collections';
    case 'vacating_alert':
    case 'extension_request':
    case 'maintenance_issue':
      return 'operations';
    case 'refund_pending':
    case 'deposit_refund_request':
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

/** Sync notifications from open action items — one record per source_key. */
export async function syncAdminNotificationsFromActionItems(
  openItems: ActionItemRow[],
): Promise<void> {
  const activeKeys = new Set<string>();

  for (const item of openItems) {
    activeKeys.add(item.sourceKey);
    const row = rowFromActionItem(item);
    const meta = row.metadata;

    const [existing] = await db
      .select({ id: adminNotifications.id })
      .from(adminNotifications)
      .where(eq(adminNotifications.sourceKey, row.sourceKey))
      .limit(1);

    if (existing) {
      await db
        .update(adminNotifications)
        .set({
          title: row.title,
          href: row.href,
          metadata: {
            ...meta,
            detail: buildDetail(row.type, meta, row.dueDate),
            typeLabel: TYPE_LABELS[row.type] ?? ACTION_ITEM_GROUP_LABELS[row.type],
          },
          updatedAt: new Date(),
        })
        .where(eq(adminNotifications.id, existing.id));
      continue;
    }

    const [inserted] = await db
      .insert(adminNotifications)
      .values({
        sourceKey: row.sourceKey,
        type: row.type,
        title: row.title,
        pgId: row.pgId,
        residentId: row.residentId,
        href: row.href,
        metadata: {
          ...meta,
          detail: buildDetail(row.type, meta, row.dueDate),
          typeLabel: TYPE_LABELS[row.type] ?? ACTION_ITEM_GROUP_LABELS[row.type],
        },
      })
      .returning({ id: adminNotifications.id });

    if (inserted) {
      await seedUnreadForAdmins(inserted.id, row.pgId);
    }
  }

  if (activeKeys.size === 0) {
    await db
      .update(adminNotificationStates)
      .set({ state: 'archived', archivedAt: new Date(), updatedAt: new Date() })
      .where(sql`${adminNotificationStates.state} != 'archived'`);
    return;
  }

  const stale = await db
    .select({ id: adminNotifications.id })
    .from(adminNotifications)
    .where(notInArray(adminNotifications.sourceKey, [...activeKeys]));

  if (stale.length > 0) {
    await db
      .update(adminNotificationStates)
      .set({ state: 'archived', archivedAt: new Date(), updatedAt: new Date() })
      .where(
        inArray(
          adminNotificationStates.notificationId,
          stale.map((s) => s.id),
        ),
      );
  }
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
    });

    if (result.length >= limit) break;
  }

  return result;
}

export async function countUnreadNotifications(session: AdminSession): Promise<number> {
  const rows = await listAdminNotifications(session, 'unread', 500);
  return rows.length;
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
  let notificationId = input.notificationId;

  if (!notificationId && input.sourceKey) {
    const [row] = await db
      .select({ id: adminNotifications.id, pgId: adminNotifications.pgId })
      .from(adminNotifications)
      .where(eq(adminNotifications.sourceKey, input.sourceKey))
      .limit(1);
    if (!row || !sessionCanSeePg(session, row.pgId)) return;
    notificationId = row.id;
  }

  if (!notificationId && input.readKey) {
    const sourceKey = resolveReadKeyToSourceKey(input.readKey);
    if (sourceKey) {
      const [row] = await db
        .select({ id: adminNotifications.id, pgId: adminNotifications.pgId })
        .from(adminNotifications)
        .where(eq(adminNotifications.sourceKey, sourceKey))
        .limit(1);
      if (!row || !sessionCanSeePg(session, row.pgId)) return;
      notificationId = row.id;
    }
  }

  if (!notificationId) return;

  await db
    .insert(adminNotificationStates)
    .values({
      adminId: session.adminId,
      notificationId,
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
  if (readKey.startsWith('kyc:')) {
    const id = readKey.slice(4);
    return `kyc:${id}`;
  }
  if (readKey.startsWith('request:')) {
    const id = readKey.slice(8);
    return `resident_request:${id}`;
  }
  if (readKey.startsWith('refund:')) {
    const bookingId = readKey.slice(7);
    return `refund:${bookingId}`;
  }
  return null;
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
