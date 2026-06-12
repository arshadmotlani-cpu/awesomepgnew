'use client';

import { useEffect } from 'react';

export default function AdminGroupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin] layout error', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B0F14] px-4 py-12 text-[#f4f6f8]">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1A1F27] p-8 text-center">
        <h1 className="text-lg font-semibold text-white">Admin console unavailable</h1>
        <p className="mt-2 text-sm text-apg-silver">
          Something went wrong loading the admin console. Try again — if this keeps happening, check
          database connectivity and pending migrations.
        </p>
        {error.digest ? (
          <p className="mt-2 text-[11px] text-apg-silver/70">Reference: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 w-full rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
