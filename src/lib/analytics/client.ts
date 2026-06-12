'use client';

import type { AnalyticsEventType } from '@/src/db/schema/siteAnalyticsEvents';

export async function trackClientPageView(path: string): Promise<void> {
  try {
    await fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
      credentials: 'same-origin',
      keepalive: true,
    });
  } catch {
    // Non-blocking.
  }
}

export async function sendAnalyticsHeartbeat(path: string): Promise<void> {
  try {
    await fetch('/api/analytics/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
      credentials: 'same-origin',
      keepalive: true,
    });
  } catch {
    // Non-blocking.
  }
}

export async function trackClientEvent(
  eventType: AnalyticsEventType,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, metadata }),
      credentials: 'same-origin',
      keepalive: true,
    });
  } catch {
    // Non-blocking.
  }
}
