'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { authFieldLabelClassName, authInputClassName } from '@/src/components/auth/authFieldStyles';
import { APG_OS } from '@/src/lib/brand/apgOsTokens';
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
      className="mx-auto w-full max-w-md space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] scheme-light sm:p-8"
    >
      <div className="hidden sm:block">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">{APG_OS.subtitle} · staff credentials</p>
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
          className="size-4 rounded border-zinc-300 text-zinc-900 focus:ring-[var(--apg-os-primary,#2563EB)]"
        />
        Remember me on this device
      </label>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-lg bg-[var(--apg-os-primary,#2563EB)] px-4 py-2.5 text-base font-semibold text-white hover:bg-[var(--apg-os-primary-hover,#1D4ED8)] disabled:bg-zinc-400"
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
        <Link href="/admin/forgot-password" className="font-medium text-[var(--apg-os-primary,#2563EB)] hover:underline">
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
