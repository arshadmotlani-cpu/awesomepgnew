'use client';

import { useEffect } from 'react';
import { Button } from '@/src/hair/components/ui/button';

export default function HairAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[fyh-app]', error);
  }, [error]);

  return (
    <div className="fyh-glass mx-auto max-w-lg space-y-4 p-8 text-center">
      <h1 className="fyh-display text-2xl font-semibold">Module error</h1>
      <p className="text-sm text-fyh-text-secondary">{error.message || 'Please try again.'}</p>
      <Button type="button" onClick={reset}>
        Retry
      </Button>
    </div>
  );
}
