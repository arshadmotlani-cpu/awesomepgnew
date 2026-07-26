'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isEditableKeyboardTarget } from '@/src/capital/lib/keyboardGuards';

const SHORTCUTS: Record<string, string> = {
  d: '/dashboard',
  a: '/assets',
  r: '/reports',
  s: '/settings',
};

export function CapitalKeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    let gPressed = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (isEditableKeyboardTarget(e.target) || isEditableKeyboardTarget(document.activeElement)) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') return;

      if (e.key === 'g' || e.key === 'G') {
        if (!gPressed && !e.metaKey && !e.ctrlKey && !e.altKey) {
          gPressed = true;
          gTimer = setTimeout(() => {
            gPressed = false;
          }, 1000);
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
          'Keyboard shortcuts:\nG then D — Dashboard\nG then A — Vehicles\nG then C — Capital\nG then R — Reports\nG then S — Settings\n⌘K — Command palette',
        );
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return null;
}
