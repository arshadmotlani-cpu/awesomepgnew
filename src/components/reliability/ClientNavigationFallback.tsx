'use client';

import { useEffect } from 'react';
import {
  CLIENT_NAV_FALLBACK_MS,
  shouldScheduleClientNavFallback,
  currentDocumentHref,
} from '@/src/lib/reliability/clientNavigationFallback';

/**
 * If a same-origin <a> click does not change the document within CLIENT_NAV_FALLBACK_MS,
 * force a full navigation so the site never feels "frozen" after a bad client bundle state.
 */
export function ClientNavigationFallback() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let pendingDest: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearPending = () => {
      pendingDest = null;
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const currentHref = currentDocumentHref(
        window.location.pathname,
        window.location.search,
        window.location.hash,
      );
      const dest = shouldScheduleClientNavFallback({
        event,
        anchor,
        origin: window.location.origin,
        currentHref,
      });
      if (!dest) return;

      clearPending();
      pendingDest = dest;
      timer = setTimeout(() => {
        const expected = pendingDest;
        clearPending();
        if (!expected) return;
        const nowHref = currentDocumentHref(
          window.location.pathname,
          window.location.search,
          window.location.hash,
        );
        if (nowHref === expected) return;
        window.location.assign(expected);
      }, CLIENT_NAV_FALLBACK_MS);
    };

    const onNavigated = () => clearPending();

    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onNavigated);
    window.addEventListener('hashchange', onNavigated);

    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onNavigated);
      window.removeEventListener('hashchange', onNavigated);
      clearPending();
    };
  }, []);

  return null;
}
