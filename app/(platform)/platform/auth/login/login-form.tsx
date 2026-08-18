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
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Awesome PG Platform
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Platform sign in</h1>
          <p className="mt-2 text-sm text-slate-400">
            Organization owners and platform administrators
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-slate-300">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-emerald-500/30 focus:ring-2"
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-slate-300">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-emerald-500/30 focus:ring-2"
              placeholder="••••••••"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input type="checkbox" name="rememberMe" className="rounded border-slate-600" />
            Remember me
          </label>
          {state.error ? (
            <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {state.error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 space-y-2 text-center text-sm text-slate-500">
          <p>
            Salon staff?{' '}
            <Link href="/fyh/auth/login" className="text-emerald-400 hover:underline">
              For Your Hair login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
