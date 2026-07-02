'use client';

import { useEffect } from 'react';

const REFRESH_INTERVAL_MS = 20 * 60 * 1000;

/**
 * Keeps resident sessions alive during long portal use without full page navigations.
 * Server-side sliding refresh runs in getCustomerSession on each call.
 */
export function CustomerSessionRefresh() {
  useEffect(() => {
    let cancelled = false;

    async function ping() {
      try {
        await fetch('/api/auth/customer/session/refresh', {
          method: 'POST',
          credentials: 'same-origin',
        });
      } catch {
        // Non-blocking — next navigation still refreshes via getCustomerSession.
      }
    }

    const id = window.setInterval(() => {
      if (!cancelled) void ping();
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return null;
}
