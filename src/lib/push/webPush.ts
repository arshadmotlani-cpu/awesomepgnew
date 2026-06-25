import webpush from 'web-push';
import { env } from '@/src/lib/env';
import { logger } from '@/src/lib/logger';

let configured = false;

export function isPushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

export function ensureWebPushConfigured(): boolean {
  if (!isPushConfigured()) return false;
  if (configured) return true;
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY!,
    env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  deepLink: string;
  notificationId: string;
  dedupeKey: string;
  unreadCount: number;
  priority?: string;
};

export async function sendWebPush(
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  },
  payload: PushPayload,
): Promise<void> {
  if (!ensureWebPushConfigured()) {
    logger.warn('[push] skipped — VAPID keys not configured');
    return;
  }
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    },
    JSON.stringify(payload),
    { TTL: 60 * 60 * 24 },
  );
}

export { webpush };
