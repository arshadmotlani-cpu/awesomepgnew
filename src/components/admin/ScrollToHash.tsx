'use client';

import { useEffect } from 'react';

/** Scroll to a URL hash after client navigation (App Router does not always do this). */
export function ScrollToHash({ hash }: { hash: string }) {
  useEffect(() => {
    if (!hash.startsWith('#')) return;
    const id = hash.slice(1);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [hash]);

  return null;
}
