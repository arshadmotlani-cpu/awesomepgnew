'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/src/components/ui/PageStates';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin] page error', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 py-12">
      <ErrorState
        title="This page could not load"
        description={
          error.digest
            ? 'The server hit an error while loading this page. This is usually a temporary database timeout or connection issue — not lost data.'
            : 'The server hit an error while loading this page. This is usually a temporary database timeout or connection issue — not lost data.'
        }
        onRetry={() => reset()}
      />
      {error.digest ? (
        <p className="mt-2 text-[11px] text-apg-silver/70">Reference: {error.digest}</p>
      ) : null}
    </div>
  );
}
