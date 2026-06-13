'use client';

import { useEffect, useRef } from 'react';
import type { AnalyticsEventType } from '@/src/db/schema/siteAnalyticsEvents';
import { mirrorClientEventToPostHog } from '@/src/lib/analytics/client';

/** Mirror a server-tracked page event to PostHog on mount (avoids duplicate DB writes). */
export function AnalyticsMountEvent({
  eventType,
  metadata,
}: {
  eventType: AnalyticsEventType;
  metadata?: Record<string, unknown>;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    mirrorClientEventToPostHog(eventType, metadata);
  }, [eventType, metadata]);

  return null;
}
