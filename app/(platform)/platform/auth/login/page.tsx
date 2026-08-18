import { Suspense } from 'react';
import PlatformLoginForm from './login-form';

export default function PlatformLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 text-slate-400">
          Loading…
        </div>
      }
    >
      <PlatformLoginForm />
    </Suspense>
  );
}
