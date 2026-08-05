import { Suspense } from 'react';
import OwnerLoginForm from './login-form';

export default function OwnerLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-[color:var(--oo-muted)]">
          Loading…
        </div>
      }
    >
      <OwnerLoginForm />
    </Suspense>
  );
}
