'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  authFieldLabelClassName,
  authInputClassName,
} from '@/src/components/auth/authFieldStyles';
import { SignupProgress } from '@/src/components/auth/SignupProgress';
import { safeNext } from '@/src/lib/auth/safeNext';

type Props = {
  email: string;
  theme?: 'light' | 'dark';
};

export function CustomerSetPasswordForm({ email, theme = 'light' }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dark = theme === 'dark';
  const shell = dark
    ? 'space-y-4 text-[#f4f6f8]'
    : 'mx-auto w-full max-w-md space-y-4 rounded-xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-sm scheme-light';
  const titleClass = dark ? 'text-lg font-semibold text-white' : 'text-xl font-semibold text-zinc-900';
  const subClass = dark ? 'mt-1 text-sm text-apg-silver' : 'mt-1 text-sm text-zinc-500';
  const inputClass = dark
    ? 'apg-field-input apg-input-dark mt-1 block w-full rounded-lg px-3 py-2.5 text-base'
    : authInputClassName;
  const labelClass = dark
    ? 'text-xs font-medium uppercase tracking-wide text-apg-silver'
    : authFieldLabelClassName;
  const btnClass = dark
    ? 'w-full rounded-lg bg-apg-orange px-4 py-2.5 text-sm font-semibold text-white apg-glow-btn hover:brightness-110 disabled:opacity-50'
    : 'w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:bg-indigo-300';
  const errorClass = dark
    ? 'rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200'
    : 'rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/customer/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirmPassword }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? 'Could not save password.');
        return;
      }
      router.replace(next);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={shell}>
      <SignupProgress current="password" theme={theme} />
      <div>
        <h1 className={titleClass}>Create your password</h1>
        <p className={subClass}>
          Signed in as <span className="font-medium">{email}</span>. Choose a password so you can
          sign in with email next time — we won&apos;t send a code every visit.
        </p>
      </div>

      <label className="block">
        <span className={labelClass}>Password</span>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <span className={`mt-1 block text-[11px] ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
          At least 8 characters.
        </span>
      </label>

      <label className="block">
        <span className={labelClass}>Confirm password</span>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={inputClass}
        />
      </label>

      <button type="submit" disabled={pending} className={btnClass}>
        {pending ? 'Saving…' : 'Save password & continue'}
      </button>

      {error ? <p className={errorClass}>{error}</p> : null}
    </form>
  );
}
