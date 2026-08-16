'use client';

import { useEffect } from 'react';

export default function OwnerAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[owner] route error', error);
  }, [error]);

  return (
    <div className="oo-empty-state mx-auto max-w-lg">
      <h1 className="text-lg font-semibold text-white">Something went wrong</h1>
      <p className="oo-page-subtitle mt-2">
        {error.message || 'An unexpected error occurred loading this page.'}
      </p>
      <button
        type="button"
        onClick={reset}
        className="oo-btn-primary mt-4 inline-flex"
      >
        Try again
      </button>
    </div>
  );
}
