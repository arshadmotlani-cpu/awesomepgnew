'use client';

import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { UserRound } from 'lucide-react';
import { loginAction, type LoginState } from '@/src/hair/actions/auth';
import { ThemeToggle } from '@/src/hair/components/ThemeToggle';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';

const initialState: LoginState = {};

export default function HairLoginPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/dashboard';
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="fyh-glow-orb pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-fyh-forest/40 blur-3xl" />
      <div className="fyh-glow-orb pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-fyh-accent/20 blur-3xl" />

      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      <div className="fyh-glass fyh-animate-in relative z-10 w-full max-w-md p-8 sm:p-10">
        <div className="fyh-animate-in-delay mb-8 text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-fyh-accent/40 bg-fyh-forest/25 shadow-lg shadow-black/30">
            <UserRound className="h-10 w-10 text-fyh-accent" aria-hidden />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-fyh-accent">
            Luxury Salon ERP
          </p>
          <h1 className="fyh-display mt-2 text-3xl font-semibold tracking-tight text-fyh-text sm:text-4xl">
            For Your Hair ERP
          </h1>
          <p className="mt-2 text-sm text-fyh-text-secondary">
            Sign in to your premium salon operating system
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-fyh-text-secondary">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@salon.com"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-fyh-text-secondary">
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
            />
          </div>

          <div className="flex items-center justify-between gap-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2 text-fyh-text-secondary">
              <input
                type="checkbox"
                name="rememberMe"
                className="h-4 w-4 rounded border-[color:var(--fyh-border)] bg-transparent accent-fyh-forest"
              />
              Remember Me
            </label>
            <Link
              href="/login"
              className="text-fyh-accent hover:text-fyh-accent-soft"
              title="Coming soon"
              onClick={(e) => e.preventDefault()}
            >
              Forgot Password
            </Link>
          </div>

          {state.error ? (
            <p className="text-sm text-fyh-danger" role="alert">
              {state.error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" size="lg" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}
