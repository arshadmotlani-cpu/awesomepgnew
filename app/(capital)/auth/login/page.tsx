'use client';

import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { loginAction, type LoginState } from '@/src/capital/actions/auth';
import { CapitalBrandLogo } from '@/src/capital/components/CapitalBrandLogo';
import { Button } from '@/src/capital/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { Input } from '@/src/capital/components/ui/input';

const initialState: LoginState = {};

export default function LoginPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/dashboard';
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <CapitalBrandLogo size={64} priority className="mx-auto shadow-lg shadow-black/40" />
          </div>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Automotive Capital — private investment OS</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-ac-text-secondary">
                Email
              </label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-ac-text-secondary">
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {state.error ? (
              <p className="text-sm text-ac-danger" role="alert">
                {state.error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
