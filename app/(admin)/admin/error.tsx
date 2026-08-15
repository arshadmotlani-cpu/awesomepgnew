'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/src/components/ui/PageStates';
import { ApgOsMark } from '@/src/components/brand/apg-os/ApgOsMark';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin] page error', {
      digest: error.digest,
      name: error.name,
      message: error.message,
    });
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 py-12">
      <ApgOsMark size={40} className="mb-4 opacity-80" />
      <ErrorState
        title="This page could not load"
        description="The server hit an error while loading this page. Try again in a moment — your data is safe."
        onRetry={() => reset()}
      />
      {error.digest ? (
        <p className="mt-2 text-[11px] text-apg-silver/70">Reference: {error.digest}</p>
      ) : null}
    </div>
  );
}
