'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDays, formatDate, todayString } from '@/src/lib/dates';
import {
  defaultCheckOutDate,
  VACATING_NOTICE_MIN_DAYS,
} from '@/src/lib/dateDefaults';
import { formatDate as formatDisplayDate, formatDateDdMmYyyy, paiseToInr } from '@/src/lib/format';
import {
  checkoutCapMessage,
  intersectFreeWindows,
  maxCheckoutForCheckIn,
} from '@/src/lib/bedAvailabilityWindows';
import type { PricingMode } from '@/src/services/pricing';
import type { BedSelectorBed } from './BedSelector';

export type BedTimelineResponse = {
  bedId: string;
  bedCode: string;
  bedStatus: 'available' | 'maintenance' | 'blocked';
  windowStart: string;
  windowEnd: string;
  lookAheadDays: number;
  earliestCheckIn: string | null;
  freeWindows: Array<{ startDate: string; endDate: string; nights: number }>;
  futureReservations: Array<{
    startDate: string;
    endDate: string;
    status: 'hold' | 'active';
    bookingCode: string | null;
  }>;
};

type Props = {
  beds: BedSelectorBed[];
  theme?: 'dark' | 'light';
  onClose: () => void;
};

type StayIntent = 'fixed' | 'indefinite';

const FIXED_MODES: Array<{ value: PricingMode; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

function depositForMode(bed: BedSelectorBed, durationMode: string): number {
  const fallback = bed.securityDepositPaise;
  if (durationMode === 'daily') {
    return bed.dailySecurityDepositPaise > 0
      ? bed.dailySecurityDepositPaise
      : fallback;
  }
  if (durationMode === 'weekly') {
    return bed.weeklySecurityDepositPaise > 0
      ? bed.weeklySecurityDepositPaise
      : fallback;
  }
  return bed.monthlySecurityDepositPaise > 0
    ? bed.monthlySecurityDepositPaise
    : fallback;
}

/**
 * Modal panel for picking stay dates after selecting bed(s). Fetches per-bed
 * availability timelines and validates checkout caps before navigation.
 */
export function BedBookingPanel({ beds, theme = 'dark', onClose }: Props) {
  const dark = theme === 'dark';
  const router = useRouter();
  const today = todayString();

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [timelines, setTimelines] = useState<BedTimelineResponse[]>([]);

  const [intent, setIntent] = useState<StayIntent>('indefinite');
  const [fixedMode, setFixedMode] = useState<PricingMode>('monthly');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(() => defaultCheckOutDate(today));
  const [validationError, setValidationError] = useState<string | null>(null);

  const loadTimelines = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const results = await Promise.all(
        beds.map(async (bed) => {
          const res = await fetch(
            `/api/beds/${bed.bedId}/availability?fromDate=${today}&lookAheadDays=365`,
          );
          const json = (await res.json()) as {
            ok: boolean;
            data?: BedTimelineResponse;
            error?: { message?: string };
          };
          if (!json.ok || !json.data) {
            throw new Error(json.error?.message ?? `Could not load ${bed.bedCode}`);
          }
          return json.data;
        }),
      );
      setTimelines(results);

      const earliest = results
        .map((t) => t.earliestCheckIn)
        .filter((d): d is string => Boolean(d))
        .sort()[0];
      if (earliest) {
        setStart(earliest);
        setEnd(defaultCheckOutDate(earliest));
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load availability');
    } finally {
      setLoading(false);
    }
  }, [beds, today]);

  useEffect(() => {
    void loadTimelines();
  }, [loadTimelines]);

  const combinedFreeWindows = useMemo(
    () => intersectFreeWindows(timelines.map((t) => t.freeWindows)),
    [timelines],
  );

  const maxCheckout = useMemo(
    () => maxCheckoutForCheckIn(start, combinedFreeWindows),
    [start, combinedFreeWindows],
  );

  const minCheckOut = formatDate(addDays(start, 1));
  const checkoutCapDisplay = maxCheckout ? formatDateDdMmYyyy(maxCheckout) : null;

  const availabilityEnd = useMemo(() => defaultCheckOutDate(start), [start]);

  function handleStartChange(value: string) {
    setStart(value);
    setValidationError(null);
    if (intent === 'fixed') {
      const cap = maxCheckoutForCheckIn(value, combinedFreeWindows);
      const preferred = defaultCheckOutDate(value);
      if (cap && preferred > cap) {
        setEnd(formatDate(addDays(cap, -1)));
      } else if (end <= value) {
        setEnd(preferred);
      }
    }
  }

  function validateAndContinue() {
    setValidationError(null);
    if (timelines.some((t) => t.bedStatus !== 'available')) {
      setValidationError('One or more selected beds cannot be booked.');
      return;
    }
    if (!maxCheckoutForCheckIn(start, combinedFreeWindows)) {
      setValidationError('The selected check-in date is not available for these beds.');
      return;
    }

    const mode: PricingMode = intent === 'indefinite' ? 'open_ended' : fixedMode;
    const checkout = intent === 'indefinite' ? availabilityEnd : end;

    if (mode !== 'open_ended') {
      const cap = maxCheckoutForCheckIn(start, combinedFreeWindows);
      if (!cap || end > cap) {
        setValidationError(
          cap
            ? checkoutCapMessage(cap)
            : 'Invalid stay dates for the selected beds.',
        );
        return;
      }
      if (end <= start) {
        setValidationError('Check-out must be after check-in.');
        return;
      }
    }

    const params = new URLSearchParams();
    params.set('start', start);
    params.set('end', checkout);
    params.set('mode', mode);
    for (const bed of beds) params.append('bed', bed.bedId);
    router.push(`/booking/new?${params.toString()}`);
  }

  const shell = dark
    ? 'rounded-2xl border border-white/10 apg-glass shadow-2xl'
    : 'rounded-xl border border-zinc-200 bg-white shadow-xl';
  const label = dark ? 'text-xs font-medium text-apg-silver' : 'text-xs font-medium text-zinc-600';
  const input = dark
    ? 'apg-input-dark h-10 w-full rounded-lg px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50'
    : 'h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-100';
  const btnPrimary = dark
    ? 'rounded-lg bg-apg-orange px-5 py-2.5 text-sm font-semibold text-white apg-glow-btn hover:brightness-110 disabled:opacity-40'
    : 'rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40';
  const btnGhost = dark
    ? 'rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-apg-silver hover:border-white/30 hover:text-white'
    : 'rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bed-booking-title"
    >
      <div className={`w-full max-w-lg max-h-[90vh] overflow-y-auto ${shell}`}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/10 bg-inherit px-4 py-4 sm:px-5">
          <div>
            <h2
              id="bed-booking-title"
              className={`text-lg font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}
            >
              Book {beds.length === 1 ? `bed ${beds[0]!.bedCode}` : `${beds.length} beds`}
            </h2>
            <p className={`mt-0.5 text-xs ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
              Pick your dates — availability is checked per bed before you continue.
            </p>
          </div>
          <button type="button" onClick={onClose} className={btnGhost} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          {loading ? (
            <p className={`text-sm ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
              Loading bed availability…
            </p>
          ) : fetchError ? (
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              {fetchError}
            </div>
          ) : (
            <>
              <ul className="space-y-2">
                {beds.map((bed) => {
                  const timeline = timelines.find((t) => t.bedId === bed.bedId);
                  const rate =
                    fixedMode === 'daily'
                      ? bed.dailyRatePaise
                      : fixedMode === 'weekly'
                        ? bed.weeklyRatePaise
                        : bed.monthlyRatePaise;
                  return (
                    <li
                      key={bed.bedId}
                      className={
                        dark
                          ? 'rounded-xl border border-white/10 apg-glass-light p-3'
                          : 'rounded-lg border border-zinc-200 bg-zinc-50 p-3'
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}>
                          {bed.bedCode}
                        </span>
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                          {timeline?.earliestCheckIn
                            ? `From ${timeline.earliestCheckIn}`
                            : 'Unavailable'}
                        </span>
                      </div>
                      {rate > 0 ? (
                        <p className={`mt-1 text-xs ${dark ? 'text-apg-silver' : 'text-zinc-600'}`}>
                          {paiseToInr(rate)} / {fixedMode === 'daily' ? 'day' : fixedMode === 'weekly' ? 'week' : 'mo'}
                          {depositForMode(bed, fixedMode) > 0
                            ? ` · ${paiseToInr(depositForMode(bed, fixedMode))} deposit`
                            : ''}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              {timelines.some((t) => t.futureReservations.length > 0) ? (
                <div className={dark ? 'rounded-xl border border-white/10 p-3' : 'rounded-lg border border-zinc-200 p-3'}>
                  <p className={`text-xs font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}>
                    Upcoming reservations on this bed
                  </p>
                  <ul className={`mt-2 space-y-1 text-xs ${dark ? 'text-apg-silver' : 'text-zinc-600'}`}>
                    {timelines.flatMap((t) =>
                      t.futureReservations.slice(0, 4).map((r) => (
                        <li key={`${t.bedId}-${r.startDate}-${r.endDate}`}>
                          {formatDisplayDate(r.startDate)} → {formatDisplayDate(r.endDate)}
                          {r.bookingCode ? ` · ${r.bookingCode}` : ''}
                          <span className="opacity-60"> ({r.status})</span>
                        </li>
                      )),
                    )}
                  </ul>
                </div>
              ) : null}

              <fieldset className="space-y-2">
                <legend className={`${label} mb-1`}>How long are you staying?</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label
                    className={
                      dark
                        ? `rounded-xl border px-3 py-2.5 text-left ${
                            intent === 'indefinite'
                              ? 'border-apg-orange/50 bg-apg-orange/10'
                              : 'border-white/10 bg-white/5'
                          }`
                        : `rounded-lg border px-3 py-2.5 text-left ${
                            intent === 'indefinite'
                              ? 'border-indigo-500 bg-indigo-50'
                              : 'border-zinc-200 bg-white'
                          }`
                    }
                  >
                    <input
                      type="radio"
                      checked={intent === 'indefinite'}
                      onChange={() => setIntent('indefinite')}
                      className="sr-only"
                    />
                    <span className={`text-sm font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}>
                      Living here
                    </span>
                    <span className={`mt-0.5 block text-xs ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
                      Monthly billing · {VACATING_NOTICE_MIN_DAYS} days notice to leave
                    </span>
                  </label>
                  <label
                    className={
                      dark
                        ? `rounded-xl border px-3 py-2.5 text-left ${
                            intent === 'fixed'
                              ? 'border-apg-orange/50 bg-apg-orange/10'
                              : 'border-white/10 bg-white/5'
                          }`
                        : `rounded-lg border px-3 py-2.5 text-left ${
                            intent === 'fixed'
                              ? 'border-indigo-500 bg-indigo-50'
                              : 'border-zinc-200 bg-white'
                          }`
                    }
                  >
                    <input
                      type="radio"
                      checked={intent === 'fixed'}
                      onChange={() => setIntent('fixed')}
                      className="sr-only"
                    />
                    <span className={`text-sm font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}>
                      Fixed dates
                    </span>
                    <span className={`mt-0.5 block text-xs ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
                      Daily, weekly, or monthly stay
                    </span>
                  </label>
                </div>
              </fieldset>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className={`flex flex-col gap-1 ${label}`}>
                  {intent === 'indefinite' ? 'Move-in date' : 'Check-in'}
                  <input
                    type="date"
                    value={start}
                    min={timelines[0]?.earliestCheckIn ?? today}
                    max={maxCheckout ?? undefined}
                    onChange={(e) => handleStartChange(e.target.value)}
                    className={input}
                  />
                </label>
                {intent === 'fixed' ? (
                  <>
                    <label className={`flex flex-col gap-1 ${label}`}>
                      Check-out
                      <input
                        type="date"
                        value={end}
                        min={minCheckOut}
                        max={maxCheckout ?? undefined}
                        onChange={(e) => {
                          setEnd(e.target.value);
                          setValidationError(null);
                        }}
                        className={input}
                      />
                    </label>
                    <label className={`flex flex-col gap-1 sm:col-span-2 ${label}`}>
                      Stay type
                      <select
                        value={fixedMode}
                        onChange={(e) => setFixedMode(e.target.value as PricingMode)}
                        className={input}
                      >
                        {FIXED_MODES.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
              </div>

              {intent === 'fixed' && checkoutCapDisplay && maxCheckout ? (
                <p
                  className={
                    dark
                      ? 'rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100'
                      : 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900'
                  }
                >
                  This bed is only available until{' '}
                  <strong>{checkoutCapDisplay}</strong> because another guest has already
                  reserved this bed after that date.
                </p>
              ) : null}

              {validationError ? (
                <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {validationError}
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-white/10 bg-inherit px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button
            type="button"
            disabled={loading || Boolean(fetchError)}
            onClick={validateAndContinue}
            className={btnPrimary}
          >
            Continue to booking →
          </button>
        </div>
      </div>
    </div>
  );
}
