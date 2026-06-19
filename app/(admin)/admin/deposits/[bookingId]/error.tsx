'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { IconAlertTriangle } from '@/src/components/admin/icons';

export default function DepositDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[deposit-detail] error boundary', error);
  }, [error]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/5 px-6 py-12 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">
        <IconAlertTriangle width={24} height={24} />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-white">Deposit details could not load</h2>
      <p className="mt-2 max-w-md text-sm text-apg-silver">
        {error.message?.trim() ||
          'Something went wrong loading this deposit record. Your save may have partially applied — check Settings → Repair Deposits.'}
      </p>
      {error.digest ? (
        <p className="mt-2 text-[11px] text-apg-silver/70">Reference: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-[#FF5A1F] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110"
        >
          Reload page
        </button>
        <Link
          href="/admin/deposits"
          className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-apg-silver hover:text-white"
        >
          ← All deposits
        </Link>
      </div>
    </div>
  );
}
