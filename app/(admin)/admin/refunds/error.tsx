'use client';

export default function RefundsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-white">Refund workspace unavailable</h1>
      <p className="mt-2 text-sm text-apg-silver">
        {error.message || 'Something went wrong loading this refund workspace.'}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white"
        >
          Try again
        </button>
        <a
          href="/admin/refunds"
          className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/5"
        >
          Back to search
        </a>
      </div>
    </div>
  );
}
