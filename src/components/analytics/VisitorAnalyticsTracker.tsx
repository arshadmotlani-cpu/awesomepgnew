'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trackClientPageView } from '@/src/lib/analytics/client';
import { shouldTrackPath } from '@/src/lib/analytics/pageKeys';

/**
 * Records page views on navigation only.
 * Does not heartbeat Postgres on an interval — that kept Neon from scaling to zero.
 */
export function VisitorAnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || !shouldTrackPath(pathname)) return;

    const fullPath = searchParams?.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;

    if (lastTracked.current === fullPath) return;
    lastTracked.current = fullPath;

    const referrer = typeof document !== 'undefined' ? document.referrer : '';
    const utmSource = searchParams?.get('utm_source') ?? undefined;
    const utmMedium = searchParams?.get('utm_medium') ?? undefined;
    const utmCampaign = searchParams?.get('utm_campaign') ?? undefined;

    void fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: fullPath,
        referrer,
        utmSource,
        utmMedium,
        utmCampaign,
      }),
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => {
      void trackClientPageView(fullPath);
    });
  }, [pathname, searchParams]);

  return null;
}
