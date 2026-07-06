'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { UNFINISHED_RESERVATION_HEADLINE } from '@/src/lib/reservationLifecycle/constants';
import { cancelBedReserveDraftAction } from '@/app/(customer)/reserve/new/actions';

type Props = {
  bookingCode: string;
  bookingId: string;
  variant?: 'dark' | 'light';
};

export function UnfinishedReservationBanner({
  bookingCode,
  bookingId,
  variant = 'dark',
}: Props) {
  const [pending, startTransition] = useTransition();
  const isDark = variant === 'dark';

  function cancelDraft() {
    startTransition(async () => {
      await cancelBedReserveDraftAction(bookingId);
    });
  }

  return (
    <div
      className={
        isDark
          ? 'rounded-[14px] border border-amber-400/30 bg-amber-500/10 p-4'
          : 'rounded-xl border border-amber-200 bg-amber-50 p-4'
      }
    >
      <p
        className={
          isDark ? 'text-sm font-medium text-amber-100' : 'text-sm font-medium text-amber-900'
        }
      >
        {UNFINISHED_RESERVATION_HEADLINE}
      </p>
      <p className={`mt-1 text-xs ${isDark ? 'text-amber-200/80' : 'text-amber-800'}`}>
        Continue to upload payment proof, or cancel to start over on this bed.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/booking/${bookingCode}/pay`}
          className="inline-flex rounded-lg bg-apg-orange px-4 py-2 text-sm font-semibold text-white"
        >
          Continue reservation
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={cancelDraft}
          className={
            isDark
              ? 'rounded-lg border border-white/15 px-4 py-2 text-sm text-apg-silver hover:bg-white/5 disabled:opacity-50'
              : 'rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50'
          }
        >
          {pending ? 'Cancelling…' : 'Cancel reservation'}
        </button>
      </div>
    </div>
  );
}
