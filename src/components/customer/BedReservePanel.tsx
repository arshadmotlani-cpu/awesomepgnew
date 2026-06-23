'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileBottomSheet } from '@/src/components/customer/block/MobileBottomSheet';
import { addDays, formatDate, todayString } from '@/src/lib/dates';
import { RESERVE_MAX_PERIOD_DAYS, RESERVE_MIN_PERIOD_DAYS } from '@/src/lib/bedReservePolicy';
import { formatDate as formatDisplayDate, paiseToInr } from '@/src/lib/format';
import { HOLD_THIS_BED } from '@/src/lib/booking/bookingFunnelLabels';
import type { BedSelectorBed } from './customerBedTypes';

type Props = {
  bed: BedSelectorBed;
  earliestStart?: string;
  onClose: () => void;
  presentation?: 'center' | 'bottomSheet';
};

export function BedReservePanel({
  bed,
  earliestStart,
  onClose,
  presentation = 'center',
}: Props) {
  const router = useRouter();
  const minStart = earliestStart ?? todayString();
  const [reserveStart, setReserveStart] = useState(minStart);
  const [checkInDate, setCheckInDate] = useState(() =>
    formatDate(addDays(minStart, Math.max(RESERVE_MIN_PERIOD_DAYS, 7))),
  );
  const [quote, setQuote] = useState<{
    feePaise: number;
    monthlyRatePaise: number;
    bufferDate: string;
    periodDays: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadQuote = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(
        `/api/beds/${bed.bedId}/reserve-quote?start=${reserveStart}&checkIn=${checkInDate}`,
      );
      const json = (await res.json()) as {
        ok: boolean;
        data?: typeof quote;
        error?: { message?: string };
      };
      if (!json.ok || !json.data) {
        throw new Error(json.error?.message ?? 'Could not quote reserve fee.');
      }
      setQuote(json.data);
    } catch (err) {
      setQuote(null);
      setError(err instanceof Error ? err.message : 'Quote failed.');
    }
  }, [bed.bedId, reserveStart, checkInDate]);

  useEffect(() => {
    void loadQuote();
  }, [loadQuote]);

  const continueToPay = () => {
    const params = new URLSearchParams({
      bed: bed.bedId,
      start: reserveStart,
      checkIn: checkInDate,
    });
    router.push(`/reserve/new?${params.toString()}`);
    onClose();
  };

  const maxCheckIn = formatDate(addDays(reserveStart, RESERVE_MAX_PERIOD_DAYS));
  const titleId = 'bed-reserve-title';

  const bodyContent = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-apg-muted">
            {HOLD_THIS_BED} · 50% rent
          </p>
          <h2 id={titleId} className="text-lg font-semibold text-white">
            Bed {bed.bedCode}
          </h2>
        </div>
        {presentation === 'center' ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-apg-silver hover:bg-white/5"
            aria-label="Close"
          >
            ✕
          </button>
        ) : null}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-apg-silver">
        Pay <strong className="text-white">50% of one month&apos;s rent</strong> now to hold this bed
        until your check-in date.
      </p>

      <div className="mt-4 space-y-3">
        <label className="block text-xs text-apg-silver">
          Hold starts
          <input
            type="date"
            min={minStart}
            max={maxCheckIn}
            value={reserveStart}
            onChange={(e) => setReserveStart(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-apg-silver">
          Your check-in date
          <input
            type="date"
            min={formatDate(addDays(reserveStart, RESERVE_MIN_PERIOD_DAYS))}
            max={maxCheckIn}
            value={checkInDate}
            onChange={(e) => setCheckInDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}

      {quote ? (
        <dl className="mt-4 rounded-[14px] border border-white/10 bg-white/[0.03] p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-apg-silver">Monthly rent (reference)</dt>
            <dd className="text-white">{paiseToInr(quote.monthlyRatePaise)}</dd>
          </div>
          <div className="mt-2 flex justify-between font-semibold">
            <dt className="text-white">Hold fee (50%)</dt>
            <dd className="text-apg-orange">{paiseToInr(quote.feePaise)}</dd>
          </div>
          <div className="mt-2 flex justify-between text-xs">
            <dt className="text-apg-silver">Cleaning buffer</dt>
            <dd className="text-apg-silver">{formatDisplayDate(quote.bufferDate)}</dd>
          </div>
        </dl>
      ) : null}

      <button
        type="button"
        disabled={!quote || loading}
        onClick={continueToPay}
        className="mt-5 w-full rounded-[14px] bg-apg-orange py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        Continue to payment
      </button>
    </>
  );

  if (presentation === 'bottomSheet') {
    return (
      <MobileBottomSheet open onClose={onClose} ariaLabelledBy={titleId}>
        <div className="max-h-[calc(88vh-2.5rem)] overflow-y-auto overscroll-contain px-5 pb-8 pt-0">
          {bodyContent}
        </div>
      </MobileBottomSheet>
    );
  }

  return (
    <div className="fixed inset-0 z-[99960] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#1A1F27] p-5 shadow-2xl">
        {bodyContent}
      </div>
    </div>
  );
}
