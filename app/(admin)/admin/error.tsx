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
    console.error('[admin] page error', error);
    // #region agent log
    fetch('http://127.0.0.1:7596/ingest/7ac86f2a-cbab-4d25-8804-7532d754a1bb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'b2af77' },
      body: JSON.stringify({
        sessionId: 'b2af77',
        hypothesisId: 'H4',
        location: 'admin/error.tsx',
        message: 'admin error boundary',
        data: {
          digest: error.digest,
          name: error.name,
          message: error.message?.slice(0, 300),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 py-12">
      <ApgOsMark size={40} className="mb-4 opacity-80" />
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
