'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const SHORTCUTS: Record<string, string> = {
  d: '/dashboard',
  a: '/assets',
  e: '/expenses',
  p: '/payments',
  c: '/capital',
  l: '/ledger',
  o: '/documents',
  r: '/reports',
  n: '/analytics',
  s: '/settings',
  h: '/activity',
};

export function CapitalKeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    let gPressed = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') return;

      if (e.key === 'g' || e.key === 'G') {
        if (!gPressed && !e.metaKey && !e.ctrlKey && !e.altKey) {
          gPressed = true;
          gTimer = setTimeout(() => { gPressed = false; }, 1000);
        }
        return;
      }

      if (gPressed && SHORTCUTS[e.key.toLowerCase()]) {
        e.preventDefault();
        router.push(SHORTCUTS[e.key.toLowerCase()]);
        gPressed = false;
        if (gTimer) clearTimeout(gTimer);
      }

      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        alert(
          'Keyboard shortcuts:\nG then D — Dashboard\nG then A — Assets\nG then E — Expenses\nG then P — Payments\nG then C — Capital\nG then L — Ledger\nG then O — Documents\nG then R — Reports\nG then N — Analytics\nG then S — Settings\n⌘K — Command palette',
        );
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return null;
}
