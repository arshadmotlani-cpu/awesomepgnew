'use client';

import { useState } from 'react';
import { redirectAfterAuth } from '@/src/lib/auth/safeNext';

export function LogoutButton({
  scope,
  label = 'Sign out',
  className = '',
  tone = 'light',
  compactBelowSm = false,
}: {
  scope: 'customer' | 'admin';
  label?: string;
  className?: string;
  tone?: 'light' | 'dark';
  /** On viewports below `sm`, show icon only (label becomes aria-label). */
  compactBelowSm?: boolean;
}) {
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ scope }),
      });
      redirectAfterAuth(scope === 'admin' ? '/admin/login' : '/login');
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={pending}
      aria-label={compactBelowSm && !pending ? label : undefined}
      className={
        className ||
        (tone === 'dark'
          ? 'rounded-md px-3 py-1.5 text-sm font-medium text-apg-silver hover:bg-white/10 hover:text-white disabled:opacity-50'
          : 'rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50')
      }
    >
      {pending ? (
        'Signing out…'
      ) : compactBelowSm ? (
        <>
          <span className="sm:hidden" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}
