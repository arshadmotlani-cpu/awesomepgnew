/**
 * User notifications + Web Push delivery — production SSOT for badge counts and push.
 */

import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { notifications, pushSubscriptions } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import {
  categoryForNotificationType,
  priorityForNotificationType,
  type NotificationCategory,
  type NotificationPriority,
} from '@/src/lib/notifications/notificationTypes';
import { sendWebPush } from '@/src/lib/push/webPush';
import { logger } from '@/src/lib/logger';
import type { ActionItem } from '@/src/db/schema/actionItems';
import type { ActionItemMetadata } from '@/src/lib/actionCenter/constants';

export type NotificationAudience = 'admin' | 'resident';

export type EmitNotificationInput = {
  audience: NotificationAudience;
  userId: string;
  type: string;
  title: string;
  body: string;
  priority?: NotificationPriority;
  entityType?: string | null;
  entityId?: string | null;
  deepLink: string;
  dedupeKey: string;
};

export type UserNotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  priority: NotificationPriority;
  entityType: string | null;
  entityId: string | null;
  deepLink: string;
  category: NotificationCategory | null;
  isRead: boolean;
  isArchived: boolean;
  createdAt: Date;
  readAt: Date | null;
};

export async function emitNotification(
  input: EmitNotificationInput,
): Promise<{ created: boolean; id?: string }> {
  const priority = input.priority ?? priorityForNotificationType(input.type);

  const inserted = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      audience: input.audience,
      type: input.type,
      title: input.title,
      body: input.body,
      priority,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      deepLink: input.deepLink,
      dedupeKey: input.dedupeKey,
      isRead: false,
      isArchived: false,
    })
    .onConflictDoNothing()
    .returning({ id: notifications.id });

  if (inserted.length === 0) {
    return { created: false };
  }

  const notificationId = inserted[0]!.id;
  const unreadCount = await countUnreadForUser(input.audience, input.userId);

  void deliverPushToUser(input.audience, input.userId, {
    title: input.title,
    body: input.body,
    deepLink: input.deepLink,
    notificationId,
    dedupeKey: input.dedupeKey,
    unreadCount,
    priority,
  }).catch((err) => {
    logger.warn('[push] deliver failed', {
      userId: input.userId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return { created: true, id: notificationId };
}

export async function emitNotificationToAdmins(
  adminIds: string[],
  input: Omit<EmitNotificationInput, 'audience' | 'userId'>,
): Promise<void> {
  const unique = Array.from(new Set(adminIds));
  await Promise.all(
    unique.map((userId) =>
      emitNotification({
        ...input,
        audience: 'admin',
        userId,
      }),
    ),
  );
}

export async function countUnreadForUser(
  audience: NotificationAudience,
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.audience, audience),
        eq(notifications.userId, userId),
        eq(notifications.isRead, false),
        eq(notifications.isArchived, false),
      ),
    );
  return Number(row?.n ?? 0);
}

export async function countUnreadForAdmin(session: AdminSession): Promise<number> {
  return countUnreadForUser('admin', session.adminId);
}

export async function listUserNotifications(
  audience: NotificationAudience,
  userId: string,
  filter: 'unread' | 'read' | 'archived' = 'unread',
  opts?: { category?: NotificationCategory | null; limit?: number },
): Promise<UserNotificationRow[]> {
  const limit = opts?.limit ?? 50;
  const conditions = [
    eq(notifications.audience, audience),
    eq(notifications.userId, userId),
  ];

  if (filter === 'unread') {
    conditions.push(eq(notifications.isRead, false));
    conditions.push(eq(notifications.isArchived, false));
  } else if (filter === 'read') {
    conditions.push(eq(notifications.isRead, true));
    conditions.push(eq(notifications.isArchived, false));
  } else {
    conditions.push(eq(notifications.isArchived, true));
  }

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(limit * 3);

  const category = opts?.category ?? null;
  const filtered = category
    ? rows.filter((r) => categoryForNotificationType(r.type) === category)
    : rows;

  return filtered.slice(0, limit).map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    priority: r.priority,
    entityType: r.entityType,
    entityId: r.entityId,
    deepLink: r.deepLink,
    category: categoryForNotificationType(r.type),
    isRead: r.isRead,
    isArchived: r.isArchived,
    createdAt: r.createdAt,
    readAt: r.readAt,
  }));
}

export async function markUserNotificationRead(
  audience: NotificationAudience,
  userId: string,
  notificationId: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(notifications)
    .set({ isRead: true, readAt: now })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.audience, audience),
        eq(notifications.userId, userId),
      ),
    );

  const unreadCount = await countUnreadForUser(audience, userId);
  void syncBadgeToDevices(audience, userId, unreadCount);
}

export async function markUserNotificationReadByDedupeKey(
  audience: NotificationAudience,
  userId: string,
  dedupeKey: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(notifications)
    .set({ isRead: true, readAt: now })
    .where(
      and(
        eq(notifications.dedupeKey, dedupeKey),
        eq(notifications.audience, audience),
        eq(notifications.userId, userId),
        eq(notifications.isRead, false),
      ),
    );

  const unreadCount = await countUnreadForUser(audience, userId);
  void syncBadgeToDevices(audience, userId, unreadCount);
}

export async function archiveUserNotification(
  audience: NotificationAudience,
  userId: string,
  notificationId: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(notifications)
    .set({ isArchived: true, isRead: true, readAt: now })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.audience, audience),
        eq(notifications.userId, userId),
      ),
    );
}

async function deliverPushToUser(
  audience: NotificationAudience,
  userId: string,
  payload: {
    title: string;
    body: string;
    deepLink: string;
    notificationId: string;
    dedupeKey: string;
    unreadCount: number;
    priority: NotificationPriority;
  },
): Promise<void> {
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.audience, audience), eq(pushSubscriptions.userId, userId)));

  if (subs.length === 0) return;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await sendWebPush(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
        await db
          .update(pushSubscriptions)
          .set({ lastSeen: new Date() })
          .where(eq(pushSubscriptions.id, sub.id));
      } catch (err: unknown) {
        const statusCode =
          err && typeof err === 'object' && 'statusCode' in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        }
        throw err;
      }
    }),
  );
}

/** Silent push to update home-screen badge without showing a notification. */
async function syncBadgeToDevices(
  audience: NotificationAudience,
  userId: string,
  unreadCount: number,
): Promise<void> {
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.audience, audience), eq(pushSubscriptions.userId, userId)));

  if (subs.length === 0) return;

  const payload = {
    title: '',
    body: '',
    deepLink: '/admin/notifications',
    notificationId: '',
    dedupeKey: `badge:${Date.now()}`,
    unreadCount,
    silent: true,
  };

  await Promise.all(
    subs.map((sub) =>
      sendWebPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      ).catch(() => undefined),
    ),
  );
}

/** Bridge action_items → user notifications + push. */
export async function emitAdminNotificationsForActionItem(input: {
  adminIds: string[];
  sourceKey: string;
  type: ActionItem['type'];
  title: string;
  body: string;
  href: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: ActionItemMetadata;
}): Promise<void> {
  const type = mapActionItemTypeToNotificationType(input.type);
  const deepLink = improveDeepLink(input.type, input.href, input.metadata);

  await emitNotificationToAdmins(input.adminIds, {
    type,
    title: input.title,
    body: input.body,
    deepLink,
    dedupeKey: input.sourceKey,
    entityType: input.entityType ?? input.type,
    entityId: input.entityId ?? null,
    priority: priorityForNotificationType(type),
  });
}

function mapActionItemTypeToNotificationType(type: ActionItem['type']): string {
  if (type === 'payment_received') return 'payment_proof_uploaded';
  if (type === 'fixed_stay_checkout_due') return 'checkout_settlement';
  return type;
}

function improveDeepLink(
  type: ActionItem['type'],
  href: string,
  meta?: ActionItemMetadata,
): string {
  if (type === 'payment_received' && meta?.bookingId) {
    return `/admin/operations/payment-reviews?booking=${meta.bookingId}`;
  }
  if (type === 'kyc_pending' && meta?.submissionId) {
    return `/admin/residents/kyc/${meta.submissionId}`;
  }
  if (
    (type === 'refund_pending' || type === 'deposit_refund_request') &&
    meta?.bookingId
  ) {
    return `/admin/deposits/${meta.bookingId}`;
  }
  if (type === 'vacating_alert' && meta?.settlementId) {
    return `/admin/checkout-settlements/${meta.settlementId}`;
  }
  if (type === 'vacating_alert' && meta?.vacatingRequestId) {
    return `/admin/vacating?read=${encodeURIComponent(`vacating:${meta.vacatingRequestId}`)}`;
  }
  if (type === 'fixed_stay_checkout_due' && meta?.settlementId) {
    return `/admin/checkout-settlements/${meta.settlementId}`;
  }
  return href;
}

export async function emitBookingCreatedAdminNotifications(input: {
  adminIds: string[];
  bookingId: string;
  bookingCode: string;
  pgName: string;
  residentName: string;
}): Promise<void> {
  await emitNotificationToAdmins(input.adminIds, {
    type: 'booking_created',
    title: 'New booking received',
    body: `${input.residentName} booked at ${input.pgName} (${input.bookingCode})`,
    deepLink: `/admin/bookings/${input.bookingId}`,
    dedupeKey: `booking_created:${input.bookingId}`,
    entityType: 'booking',
    entityId: input.bookingId,
    priority: 'critical',
  });
}

export async function archiveNotificationsByDedupeKeys(
  audience: NotificationAudience,
  userIds: string[],
  dedupeKeys: string[],
): Promise<void> {
  if (dedupeKeys.length === 0 || userIds.length === 0) return;
  await db
    .update(notifications)
    .set({ isArchived: true })
    .where(
      and(
        eq(notifications.audience, audience),
        inArray(notifications.userId, userIds),
        inArray(notifications.dedupeKey, dedupeKeys),
      ),
    );
}

/** Unified admin inbox row — maps `notifications` table for bell + overview. */
export type AdminInboxNotificationRow = {
  id: string;
  sourceKey: string;
  type: string;
  typeLabel: string;
  title: string;
  residentName: string | null;
  pgName: string | null;
  detail: string | null;
  href: string;
  state: 'unread' | 'read' | 'archived';
  createdAt: Date;
  readAt: Date | null;
  resolvedAt: Date | null;
};

const INBOX_TYPE_LABELS: Record<string, string> = {
  rent_due: 'Rent Due',
  electricity_due: 'Electricity Due',
  deposit_collection_due: 'Deposit Due',
  kyc_pending: 'KYC Pending',
  vacating_alert: 'Vacating Notice',
  payment_proof_pending: 'Payment Proof',
  checkout_settlement: 'Checkout',
  booking_created: 'New Booking',
  financial_audit_review: 'Financial Audit',
};

function mapToInboxRow(
  row: UserNotificationRow,
  state: AdminInboxNotificationRow['state'],
): AdminInboxNotificationRow {
  return {
    id: row.id,
    sourceKey: row.id,
    type: row.type,
    typeLabel: INBOX_TYPE_LABELS[row.type] ?? row.type.replace(/_/g, ' '),
    title: row.title,
    residentName: row.title,
    pgName: null,
    detail: row.body,
    href: row.deepLink,
    state,
    createdAt: row.createdAt,
    readAt: row.readAt,
    resolvedAt: row.isArchived ? row.readAt : null,
  };
}

/** SSOT admin notification list — reads `notifications` table only. */
export async function listAdminInboxNotifications(
  session: AdminSession,
  filter: 'unread' | 'read' | 'archived' | 'all' = 'unread',
  limit = 50,
): Promise<AdminInboxNotificationRow[]> {
  if (filter === 'all') {
    const [unread, read] = await Promise.all([
      listUserNotifications('admin', session.adminId, 'unread', { limit }),
      listUserNotifications('admin', session.adminId, 'read', { limit }),
    ]);
    return [
      ...unread.map((r) => mapToInboxRow(r, 'unread')),
      ...read.map((r) => mapToInboxRow(r, 'read')),
    ];
  }
  const listFilter = filter === 'archived' ? 'archived' : filter;
  const rows = await listUserNotifications('admin', session.adminId, listFilter, { limit });
  return rows.map((r) => mapToInboxRow(r, filter));
}
