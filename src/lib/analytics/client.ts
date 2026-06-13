'use client';

import posthog from 'posthog-js';
import type { AnalyticsEventType } from '@/src/db/schema/siteAnalyticsEvents';
import { sanitizeAnalyticsMetadata } from '@/src/lib/analytics/sanitize';

function mirrorToPostHog(eventType: AnalyticsEventType, metadata?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim()) return;
  if (!posthog.__loaded) return;
  posthog.capture(eventType, sanitizeAnalyticsMetadata(metadata) ?? {});
}

/** Mirror a server-tracked event to PostHog without writing to the internal DB again. */
export function mirrorClientEventToPostHog(
  eventType: AnalyticsEventType,
  metadata?: Record<string, unknown>,
): void {
  mirrorToPostHog(eventType, sanitizeAnalyticsMetadata(metadata));
}

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
  const safeMetadata = sanitizeAnalyticsMetadata(metadata);

  mirrorToPostHog(eventType, safeMetadata);

  try {
    await fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, metadata: safeMetadata }),
      credentials: 'same-origin',
      keepalive: true,
    });
  } catch {
    // Non-blocking.
  }
}
