'use client';

import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { loginAction, type LoginState } from '@/src/owner/actions/auth';
import { OwnerOsMark } from '@/src/components/brand/owner-os/OwnerOsMark';

const initialState: LoginState = {};

export default function OwnerLoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/dashboard';
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[color:var(--oo-surface)] p-6 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex justify-center">
            <OwnerOsMark size={40} className="max-w-full" title="NET WORTH" />
          </div>
          <h1 className="text-xl font-semibold text-white">Sign in</h1>
        </div>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block space-y-1 text-sm">
            <span className="text-[color:var(--oo-muted)]">Email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-white"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[color:var(--oo-muted)]">Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-white"
            />
          </label>
          {state.error ? (
            <p className="text-sm text-rose-400" role="alert">
              {state.error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
