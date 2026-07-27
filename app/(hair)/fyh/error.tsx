'use client';

import { useEffect } from 'react';
import { Button } from '@/src/hair/components/ui/button';

export default function HairError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[fyh]', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="fyh-glass max-w-md space-y-4 p-8 text-center">
        <h1 className="fyh-display text-2xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-fyh-text-secondary">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <Button type="button" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
