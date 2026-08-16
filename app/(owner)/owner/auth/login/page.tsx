import { Suspense } from 'react';
import OwnerLoginForm from './login-form';

export default function OwnerLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] text-sm text-[color:var(--oo-muted)]">
          Loading…
        </div>
      }
    >
      <OwnerLoginForm />
    </Suspense>
  );
}
