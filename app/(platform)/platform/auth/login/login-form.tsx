'use client';

import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  platformLoginAction,
  type PlatformLoginState,
} from '@/src/platform/actions/auth';

const initialState: PlatformLoginState = {};

export default function PlatformLoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/platform/dashboard';
  const [state, formAction, pending] = useActionState(platformLoginAction, initialState);

  return (
    <div className="plt-root flex min-h-[100dvh] items-center justify-center px-4 py-10">
      <div className="plt-card w-full max-w-md p-8 shadow-lg">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--plt-text-subtle)]">
            Awesome PG Platform
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--plt-text)]">Platform sign in</h1>
          <p className="mt-2 text-sm text-[var(--plt-text-muted)]">
            Organization owners and platform administrators
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-[var(--plt-text-muted)]">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              className="plt-input"
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-[var(--plt-text-muted)]">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="plt-input"
              placeholder="••••••••"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--plt-text-muted)]">
            <input type="checkbox" name="rememberMe" className="rounded border-[var(--plt-border-strong)]" />
            Remember me
          </label>
          {state.error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          ) : null}
          <button type="submit" disabled={pending} className="plt-btn-primary w-full justify-center py-2.5">
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 space-y-2 text-center text-sm text-[var(--plt-text-subtle)]">
          <p>
            Salon staff?{' '}
            <Link href="/fyh/auth/login" className="text-[var(--plt-accent-hover)] hover:underline">
              For Your Hair login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
