'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDays, formatDate, todayString } from '@/src/lib/dates';
import { RESERVE_MAX_PERIOD_DAYS, RESERVE_MIN_PERIOD_DAYS } from '@/src/lib/bedReservePolicy';
import { formatDate as formatDisplayDate, paiseToInr } from '@/src/lib/format';
import type { BedSelectorBed } from './customerBedTypes';

type Props = {
  bed: BedSelectorBed;
  earliestStart?: string;
  onClose: () => void;
};

export function BedReservePanel({ bed, earliestStart, onClose }: Props) {
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

  return (
    <div className="fixed inset-0 z-[99960] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#1A1F27] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-apg-orange">
              Reserve bed · 50% rent
            </p>
            <h2 className="text-xl font-semibold text-white">Bed {bed.bedCode}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-apg-silver hover:bg-white/5"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-apg-silver">
          Pay <strong className="text-white">50% of one month&apos;s rent</strong> now to hold this
          bed until your check-in date. The fee is <strong className="text-rose-300">non-refundable</strong>{' '}
          and is <strong className="text-white">not</strong> applied when you complete your full
          booking. Daily or weekly guests may stay on this bed during your reserve window (except the
          cleaning day before you arrive).
        </p>

        <div className="mt-4 space-y-3">
          <label className="block text-xs text-apg-silver">
            Reserve starts
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
            Your check-in date (complete full booking &amp; pay rent + deposit on this day)
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
          <dl className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-apg-silver">Monthly rent (reference)</dt>
              <dd className="text-white">{paiseToInr(quote.monthlyRatePaise)}</dd>
            </div>
            <div className="mt-2 flex justify-between font-semibold">
              <dt className="text-white">Reserve fee (50%)</dt>
              <dd className="text-apg-orange">{paiseToInr(quote.feePaise)}</dd>
            </div>
            <div className="mt-2 flex justify-between text-xs">
              <dt className="text-apg-silver">Cleaning buffer</dt>
              <dd className="text-apg-silver">{formatDisplayDate(quote.bufferDate)}</dd>
            </div>
            <div className="mt-1 flex justify-between text-xs">
              <dt className="text-apg-silver">Reserve period</dt>
              <dd className="text-apg-silver">{quote.periodDays} days</dd>
            </div>
          </dl>
        ) : null}

        <button
          type="button"
          disabled={!quote || loading}
          onClick={continueToPay}
          className="mt-5 w-full rounded-lg bg-apg-orange py-2.5 text-sm font-semibold text-white disabled:opacity-50 apg-glow-btn"
        >
          Continue to payment
        </button>
      </div>
    </div>
  );
}
