'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { authFieldLabelClassName, authInputClassName } from '@/src/components/auth/authFieldStyles';
import { redirectAfterAuth, safeAdminNext } from '@/src/lib/auth/safeNext';

export function AdminChangePasswordForm({ email }: { email: string }) {
  const searchParams = useSearchParams();
  const next = safeAdminNext(searchParams.get('next'));

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? 'Could not update password.');
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
        <h1 className="text-xl font-semibold text-zinc-900">Set a new password</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Signed in as <span className="font-medium text-zinc-700">{email}</span>. Choose a
          strong password before continuing to the admin console.
        </p>
      </div>

      <label className="block">
        <span className={authFieldLabelClassName}>Current password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className={authInputClassName}
        />
      </label>

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
        {pending ? 'Updating…' : 'Update password & continue'}
      </button>

      {error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}
    </form>
  );
}
