'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton({
  scope,
  label = 'Sign out',
  className = '',
  tone = 'light',
}: {
  scope: 'customer' | 'admin';
  label?: string;
  className?: string;
  tone?: 'light' | 'dark';
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });
      router.replace(scope === 'admin' ? '/admin/login' : '/login');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={pending}
      className={
        className ||
        (tone === 'dark'
          ? 'rounded-md px-3 py-1.5 text-sm font-medium text-apg-silver hover:bg-white/10 hover:text-white disabled:opacity-50'
          : 'rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50')
      }
    >
      {pending ? 'Signing out…' : label}
    </button>
  );
}
