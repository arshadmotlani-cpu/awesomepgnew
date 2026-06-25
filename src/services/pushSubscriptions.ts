import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { pushSubscriptions } from '@/src/db/schema';
import type { NotificationAudience } from '@/src/services/notificationEngine';

export type PushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  deviceName?: string | null;
  platform?: string | null;
};

export async function upsertPushSubscription(
  audience: NotificationAudience,
  userId: string,
  input: PushSubscriptionInput,
): Promise<void> {
  const now = new Date();
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      audience,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      deviceName: input.deviceName ?? null,
      platform: input.platform ?? null,
      lastSeen: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        audience,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        deviceName: input.deviceName ?? null,
        platform: input.platform ?? null,
        lastSeen: now,
      },
    });
}

export async function removePushSubscription(
  audience: NotificationAudience,
  userId: string,
  endpoint: string,
): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.audience, audience),
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    );
}

export async function removeAllPushSubscriptionsForUser(
  audience: NotificationAudience,
  userId: string,
): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.audience, audience), eq(pushSubscriptions.userId, userId)));
}
