'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { IconAlertTriangle } from '@/src/components/admin/icons';

export default function DepositDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const bookingId = typeof params?.bookingId === 'string' ? params.bookingId : null;

  const detail = error.message?.trim() || 'Something went wrong loading this deposit.';

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/5 px-6 py-12 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">
        <IconAlertTriangle width={24} height={24} />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-white">Deposit details could not load</h2>
      <p className="mt-2 max-w-lg text-sm text-rose-100">{detail}</p>
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
        {bookingId ? (
          <Link
            href={`/admin/bookings/${bookingId}`}
            className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-apg-silver hover:text-white"
          >
            Booking operations
          </Link>
        ) : null}
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
