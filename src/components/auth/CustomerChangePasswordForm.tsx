'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  authFieldLabelClassName,
  authInputClassName,
} from '@/src/components/auth/authFieldStyles';
import {
  ACCOUNT_LINK_ON_DARK,
  ACCOUNT_PAGE_SUBTITLE,
  ACCOUNT_PAGE_TITLE,
} from '@/src/components/customer/accountStyles';

export function CustomerChangePasswordForm({ email }: { email: string }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/auth/customer/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? 'Could not update password.');
        return;
      }
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="apg-glass max-w-lg space-y-4 rounded-2xl p-6">
      <div>
        <h2 className={ACCOUNT_PAGE_TITLE}>Change password</h2>
        <p className={ACCOUNT_PAGE_SUBTITLE}>
          Account: {email}. Use your current password — we only send email codes for forgot password.
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
          className="apg-field-input apg-input-dark mt-1 block w-full rounded-lg px-3 py-2.5 text-base"
        />
      </label>

      <label className="block">
        <span className={authFieldLabelClassName}>New password</span>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="apg-field-input apg-input-dark mt-1 block w-full rounded-lg px-3 py-2.5 text-base"
        />
        <span className="mt-1 block text-[11px] text-apg-silver">At least 8 characters.</span>
      </label>

      <label className="block">
        <span className={authFieldLabelClassName}>Confirm new password</span>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="apg-field-input apg-input-dark mt-1 block w-full rounded-lg px-3 py-2.5 text-base"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-apg-orange px-4 py-2.5 text-sm font-semibold text-white apg-glow-btn hover:brightness-110 disabled:opacity-50"
      >
        {pending ? 'Updating…' : 'Update password'}
      </button>

      {success ? (
        <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
          Password updated.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</p>
      ) : null}

      <p className="text-xs text-apg-silver">
        Forgot your password?{' '}
        <a href="/login" className={ACCOUNT_LINK_ON_DARK}>
          Sign out and use forgot password on the login page
        </a>
        .
      </p>
    </form>
  );
}
