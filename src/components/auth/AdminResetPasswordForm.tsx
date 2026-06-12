'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authFieldLabelClassName, authInputClassName } from '@/src/components/auth/authFieldStyles';
import { redirectAfterAuth } from '@/src/lib/auth/safeNext';

export function AdminResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [email, setEmail] = useState<string | null>(null);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      return;
    }
    void (async () => {
      const res = await fetch(
        `/api/auth/admin/reset-password?token=${encodeURIComponent(token)}`,
      );
      const data = (await res.json()) as { ok: boolean; email?: string; message?: string };
      if (!res.ok || !data.ok) {
        setTokenValid(false);
        setError(data.message ?? 'Reset link is invalid or has expired.');
        return;
      }
      setTokenValid(true);
      setEmail(data.email ?? null);
    })();
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword, confirmPassword }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? 'Could not reset password.');
        return;
      }
      redirectAfterAuth('/admin/login?reset=1');
    } finally {
      setPending(false);
    }
  }

  if (tokenValid === null) {
    return (
      <div className="mx-auto w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 shadow-sm scheme-light sm:p-8">
        Verifying reset link…
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="mx-auto w-full max-w-md space-y-4 rounded-xl border border-zinc-200 bg-white p-6 text-base text-zinc-900 shadow-sm scheme-light sm:p-8">
        <h1 className="text-xl font-semibold text-zinc-900">Reset link expired</h1>
        <p className="text-sm text-zinc-600">
          {error ?? 'This reset link is invalid or has expired. Request a new one.'}
        </p>
        <Link href="/admin/forgot-password" className="inline-block text-sm font-medium text-indigo-700 hover:underline">
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-md space-y-4 rounded-xl border border-zinc-200 bg-white p-6 text-base text-zinc-900 shadow-sm scheme-light sm:p-8"
    >
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Set a new password</h1>
        {email ? (
          <p className="mt-1 text-sm text-zinc-500">
            Resetting password for{' '}
            <span className="font-medium text-zinc-700">{email}</span>.
          </p>
        ) : null}
      </div>
      <label className="block">
        <span className={authFieldLabelClassName}>New password</span>
        <input
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={authInputClassName}
        />
        <span className="mt-1 block text-[11px] text-zinc-500">At least 12 characters.</span>
      </label>
      <label className="block">
        <span className={authFieldLabelClassName}>Confirm new password</span>
        <input
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={authInputClassName}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-md bg-zinc-900 px-4 py-2.5 text-base font-semibold text-white hover:bg-zinc-800 disabled:bg-zinc-400"
      >
        {pending ? 'Updating…' : 'Update password'}
      </button>
      {error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}
    </form>
  );
}
