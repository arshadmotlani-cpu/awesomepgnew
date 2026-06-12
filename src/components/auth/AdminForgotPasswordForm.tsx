'use client';

import Link from 'next/link';
import { useState } from 'react';
import { authFieldLabelClassName, authInputClassName } from '@/src/components/auth/authFieldStyles';

type AdminForgotPasswordFormProps = {
  recoveryConfigured: boolean;
  maskedRecoveryEmail: string | null;
};

export function AdminForgotPasswordForm({
  recoveryConfigured,
  maskedRecoveryEmail,
}: AdminForgotPasswordFormProps) {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/auth/admin/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.message ?? 'Could not send reset link.');
        return;
      }
      setSuccess(data.message ?? 'Check your recovery inbox for a reset link.');
    } finally {
      setPending(false);
    }
  }

  if (!recoveryConfigured) {
    return (
      <div className="mx-auto w-full max-w-md space-y-4 rounded-xl border border-zinc-200 bg-white p-6 text-base text-zinc-900 shadow-sm scheme-light sm:p-8">
        <h1 className="text-xl font-semibold text-zinc-900">Forgot password</h1>
        <p className="text-sm text-zinc-600">
          Password recovery is not configured for this deployment. Ask your operator to set{' '}
          <code className="rounded bg-zinc-100 px-1">ADMIN_RECOVERY_EMAIL</code> and ensure email
          delivery is configured.
        </p>
        <Link href="/admin/login" className="inline-block text-sm font-medium text-indigo-700 hover:underline">
          Back to sign in
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
        <h1 className="text-xl font-semibold text-zinc-900">Forgot password</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Enter your admin account email. A reset link will be sent to{' '}
          <span className="font-medium text-zinc-700">{maskedRecoveryEmail}</span>.
        </p>
      </div>
      <label className="block">
        <span className={authFieldLabelClassName}>Admin account email</span>
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={authInputClassName}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-md bg-zinc-900 px-4 py-2.5 text-base font-semibold text-white hover:bg-zinc-800 disabled:bg-zinc-400"
      >
        {pending ? 'Sending…' : 'Send reset link'}
      </button>
      {error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</p>
      ) : null}
      <p className="text-center text-sm text-zinc-600">
        <Link href="/admin/login" className="font-medium text-indigo-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
