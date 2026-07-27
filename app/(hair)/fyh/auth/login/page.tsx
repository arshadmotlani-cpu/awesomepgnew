import { Suspense } from 'react';
import HairLoginPage from './page-client';

export default function HairLoginRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-fyh-text-secondary">
          Loading…
        </div>
      }
    >
      <HairLoginPage />
    </Suspense>
  );
}
