'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { authFieldLabelClassName, authInputClassName } from '@/src/components/auth/authFieldStyles';
import { AwesomePgLogo } from '@/src/components/brand/AwesomePgLogo';
import { redirectAfterAuth, safeAdminNext } from '@/src/lib/auth/safeNext';

type AdminLoginFormProps = {
  recoveryConfigured: boolean;
  maskedRecoveryEmail: string | null;
  passwordResetSuccess?: boolean;
};

export function AdminLoginForm({
  recoveryConfigured,
  maskedRecoveryEmail,
  passwordResetSuccess = false,
}: AdminLoginFormProps) {
  const searchParams = useSearchParams();
  const next = safeAdminNext(searchParams.get('next'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
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
        body: JSON.stringify({ email, password, rememberMe }),
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
      <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
        <AwesomePgLogo size={56} priority className="mb-3 shadow-md shadow-orange-500/20" />
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
      <label className="flex items-center gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="size-4 rounded border-zinc-300 text-zinc-900 focus:ring-indigo-500"
        />
        Remember me on this device
      </label>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-md bg-zinc-900 px-4 py-2.5 text-base font-semibold text-white hover:bg-zinc-800 disabled:bg-zinc-400"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      {passwordResetSuccess ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Password updated. Sign in with your new password.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}
      <p className="text-center text-sm text-zinc-600">
        <Link href="/admin/forgot-password" className="font-medium text-indigo-700 hover:underline">
          Forgot password?
        </Link>
      </p>
      {recoveryConfigured && maskedRecoveryEmail ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-600">
          Password reset links are sent to{' '}
          <span className="font-medium text-zinc-800">{maskedRecoveryEmail}</span>.
        </p>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          Password recovery is not configured. Set{' '}
          <code className="rounded bg-white px-1">ADMIN_RECOVERY_EMAIL</code> in your environment.
        </p>
      )}
    </form>
  );
}
