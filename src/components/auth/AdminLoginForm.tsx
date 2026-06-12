'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { authFieldLabelClassName, authInputClassName } from '@/src/components/auth/authFieldStyles';
import { redirectAfterAuth, safeAdminNext } from '@/src/lib/auth/safeNext';

export function AdminLoginForm() {
  const searchParams = useSearchParams();
  const next = safeAdminNext(searchParams.get('next'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        mustChangePassword?: boolean;
      };
      if (!res.ok || !data.ok) {
        setError(data.message ?? 'Login failed.');
        return;
      }
      if (data.mustChangePassword) {
        redirectAfterAuth(`/admin/change-password?next=${encodeURIComponent(next)}`);
        return;
      }
      redirectAfterAuth(next);
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-md space-y-4 rounded-xl border border-zinc-200 bg-white p-6 text-base text-zinc-900 shadow-sm scheme-light sm:p-8"
    >
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Admin sign in</h1>
        <p className="mt-1 text-sm text-zinc-500">Email and password for staff accounts.</p>
      </div>
      <label className="block">
        <span className={authFieldLabelClassName}>Email</span>
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={authInputClassName}
        />
      </label>
      <label className="block">
        <span className={authFieldLabelClassName}>Password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={authInputClassName}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-md bg-zinc-900 px-4 py-2.5 text-base font-semibold text-white hover:bg-zinc-800 disabled:bg-zinc-400"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      {error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}
    </form>
  );
}
