'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trackClientEvent } from '@/src/lib/analytics/client';
import { addDays, diffDays, formatDate, parseDate, todayString } from '@/src/lib/dates';
import {
  defaultCheckOutDate,
} from '@/src/lib/dateDefaults';
import { formatDate as formatDisplayDate, paiseToInr } from '@/src/lib/format';
import {
  checkoutCapMessage,
} from '@/src/lib/bedAvailabilityWindows';
import {
  isCheckInAvailableForReservations,
  isStayRangeAvailableForAllBeds,
  maxCheckoutForAllBeds,
} from '@/src/lib/bedStayOverlap';
import { reserveBufferDate } from '@/src/lib/bedReservePolicy';
import { displayMonthlyDepositPaise } from '@/src/lib/customerDepositDisplay';
import { previewLowestFixedStayRent } from '@/src/lib/pricing/fixedStayOptimizer';
import { STAY_CHECK_IN_TIME, STAY_CHECK_OUT_TIME } from '@/src/lib/residents/stayBillingRules';
import type { PricingMode } from '@/src/services/pricing';
import type { BedSelectorBed } from './BedSelector';
import { StayDateRangePicker, type StayDateSummary } from './StayDateRangePicker';

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
    status: 'active';
    bookingCode: string | null;
  }>;
};

type Props = {
  beds: BedSelectorBed[];
  theme?: 'dark' | 'light';
  onClose: () => void;
  shortStayOnly?: boolean;
  reserveCheckInDate?: string;
};

type StayIntent = 'fixed' | 'indefinite';

function estimateFixedStaySubtotal(bed: BedSelectorBed, nights: number): number {
  return previewLowestFixedStayRent(nights, bed.dailyRatePaise, bed.weeklyRatePaise);
}

function depositPreview(bed: BedSelectorBed, mode: PricingMode, nights: number): number {
  if (mode === 'open_ended') {
    return displayMonthlyDepositPaise(bed);
  }
  if (mode === 'fixed_stay' && nights > 0) {
    return Math.ceil(estimateFixedStaySubtotal(bed, nights) * 0.5);
  }
  return bed.securityDepositPaise;
}

/**
 * Modal panel for picking stay dates after selecting bed(s). Fetches per-bed
 * availability timelines and validates checkout caps before navigation.
 */
export function BedBookingPanel({
  beds,
  theme = 'dark',
  onClose,
  shortStayOnly = false,
  reserveCheckInDate,
}: Props) {
  const dark = theme === 'dark';
  const router = useRouter();
  const today = todayString();
  const reserveLastStay = reserveCheckInDate ? reserveBufferDate(reserveCheckInDate) : null;

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [timelines, setTimelines] = useState<BedTimelineResponse[]>([]);

  const [intent, setIntent] = useState<StayIntent>(shortStayOnly ? 'fixed' : 'indefinite');
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

  const reservationsByBed = useMemo(
    () => timelines.map((t) => t.futureReservations),
    [timelines],
  );

  const horizonEnd = timelines[0]?.windowEnd ?? formatDate(addDays(parseDate(today), 365));

  const maxCheckout = useMemo(() => {
    const cap = maxCheckoutForAllBeds(start, reservationsByBed, horizonEnd);
    if (shortStayOnly && reserveLastStay) {
      if (!cap) return reserveLastStay;
      return cap < reserveLastStay ? cap : reserveLastStay;
    }
    return cap;
  }, [start, reservationsByBed, horizonEnd, shortStayOnly, reserveLastStay]);

  const mode: PricingMode = intent === 'indefinite' ? 'open_ended' : 'fixed_stay';
  const fixedNights =
    intent === 'fixed' && end > start ? diffDays(parseDate(start), parseDate(end)) : 0;

  const availabilityEnd = useMemo(() => defaultCheckOutDate(start), [start]);

  const combinedReservations = useMemo(
    () => timelines.flatMap((t) => t.futureReservations),
    [timelines],
  );

  /** Blocking message — only when selected range overlaps or exceeds checkout cap. */
  const stayRangeConflict = useMemo((): string | null => {
    const checkout = intent === 'indefinite' ? availabilityEnd : end;
    if (checkout <= start) return null;

    if (!isStayRangeAvailableForAllBeds(start, checkout, reservationsByBed)) {
      return 'The selected dates overlap an existing reservation for one or more beds.';
    }

    if (intent === 'fixed') {
      const cap = maxCheckoutForAllBeds(start, reservationsByBed, horizonEnd);
      if (cap && end > cap) return checkoutCapMessage(cap);
    }

    return null;
  }, [intent, start, end, availabilityEnd, reservationsByBed, horizonEnd]);

  const staySummary = useMemo((): StayDateSummary | null => {
    if (intent !== 'fixed' || fixedNights <= 0 || beds.length === 0) return null;
    const primary = beds[0]!;
    const accommodationPaise = beds.reduce(
      (sum, bed) => sum + estimateFixedStaySubtotal(bed, fixedNights),
      0,
    );
    const depositPaise = beds.reduce(
      (sum, bed) => sum + depositPreview(bed, 'fixed_stay', fixedNights),
      0,
    );
    return {
      nights: fixedNights,
      dailyRatePaise: primary.dailyRatePaise,
      accommodationPaise,
      depositPaise,
      totalDuePaise: accommodationPaise + depositPaise,
    };
  }, [intent, fixedNights, beds]);

  const openEndedSummary = useMemo(() => {
    if (intent !== 'indefinite' || beds.length === 0) return null;
    const rentPaise = beds.reduce((sum, bed) => sum + bed.monthlyRatePaise, 0);
    const depositPaise = beds.reduce((sum, bed) => sum + displayMonthlyDepositPaise(bed), 0);
    return { rentPaise, depositPaise, totalPaise: rentPaise + depositPaise };
  }, [intent, beds]);

  function handleStartChange(value: string) {
    setStart(value);
    setValidationError(null);
    if (intent === 'fixed') {
      const cap = maxCheckoutForAllBeds(value, reservationsByBed, horizonEnd);
      const preferred = defaultCheckOutDate(value);
      if (cap && preferred > cap) {
        setEnd(formatDate(addDays(parseDate(cap), -1)));
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

    const earliest = timelines
      .map((t) => t.earliestCheckIn)
      .filter((d): d is string => Boolean(d))
      .sort()[0];
    const checkInOk = reservationsByBed.every((res) =>
      isCheckInAvailableForReservations(start, res, earliest ?? today),
    );
    if (!checkInOk) {
      setValidationError('The selected check-in date is not available for these beds.');
      return;
    }

    const checkout = intent === 'indefinite' ? availabilityEnd : end;

    if (intent === 'fixed' && end <= start) {
      setValidationError('Check-out must be after check-in.');
      return;
    }

    if (!isStayRangeAvailableForAllBeds(start, checkout, reservationsByBed)) {
      setValidationError('The selected dates overlap an existing reservation for one or more beds.');
      return;
    }

    if (intent === 'fixed') {
      const cap = maxCheckoutForAllBeds(start, reservationsByBed, horizonEnd);
      if (!cap || end > cap) {
        setValidationError(
          cap ? checkoutCapMessage(cap) : 'Invalid stay dates for the selected beds.',
        );
        return;
      }
    }

    const params = new URLSearchParams();
    params.set('start', start);
    params.set('end', checkout);
    params.set('mode', mode);
    for (const bed of beds) params.append('bed', bed.bedId);
    void trackClientEvent('bed_selected', { bedCount: beds.length });
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
              Pick your dates — we automatically apply the lowest available price.
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
                  const dep = depositPreview(bed, mode, fixedNights);
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
                      <p className={`mt-1 text-xs ${dark ? 'text-apg-silver' : 'text-zinc-600'}`}>
                        {paiseToInr(bed.weeklyRatePaise)}/wk · {paiseToInr(bed.dailyRatePaise)}/day
                        {bed.monthlyRatePaise > 0
                          ? ` · ${paiseToInr(bed.monthlyRatePaise)}/mo`
                          : ''}
                        {dep > 0
                          ? mode === 'open_ended'
                            ? ` · ${paiseToInr(dep)} deposit (2× rent)`
                            : ` · ~${paiseToInr(dep)} deposit (50%)`
                          : ''}
                      </p>
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

              {shortStayOnly && reserveCheckInDate && reserveLastStay ? (
                <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-100">
                  This bed is reserved for someone else from{' '}
                  {formatDisplayDate(reserveCheckInDate)}. Pick dates with checkout on or before{' '}
                  {formatDisplayDate(reserveLastStay)}.
                </div>
              ) : null}

              <fieldset className="space-y-2">
                <legend className={`${label} mb-1`}>Choose how you want to stay</legend>
                <div className={`grid grid-cols-1 gap-2 ${shortStayOnly ? '' : 'sm:grid-cols-2'}`}>
                  {!shortStayOnly ? (
                    <label
                      className={
                        dark
                          ? `rounded-xl border px-3 py-2.5 text-left ${
                              intent === 'indefinite'
                                ? 'border-emerald-400/50 bg-emerald-500/10'
                                : 'border-white/10 bg-white/5'
                            }`
                          : `rounded-lg border px-3 py-2.5 text-left ${
                              intent === 'indefinite'
                                ? 'border-emerald-500 bg-emerald-50'
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
                        Continue living
                      </span>
                      <span className={`mt-0.5 block text-xs ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
                        Stay as long as you want · monthly billing · no checkout date
                      </span>
                    </label>
                  ) : null}
                  <label
                    className={
                      dark
                        ? `rounded-xl border px-3 py-2.5 text-left ${
                            intent === 'fixed'
                              ? 'border-sky-400/50 bg-sky-500/10'
                              : 'border-white/10 bg-white/5'
                          }`
                        : `rounded-lg border px-3 py-2.5 text-left ${
                            intent === 'fixed'
                              ? 'border-sky-500 bg-sky-50'
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
                      Fixed stay
                    </span>
                    <span className={`mt-0.5 block text-xs ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
                      Choose check-in &amp; check-out — perfect for short stays
                    </span>
                  </label>
                </div>
              </fieldset>

              <StayDateRangePicker
                theme={dark ? 'dark' : 'light'}
                checkIn={start}
                checkOut={intent === 'fixed' ? end : null}
                onCheckInChange={handleStartChange}
                onCheckOutChange={(d) => {
                  setEnd(d);
                  setValidationError(null);
                }}
                minCheckIn={timelines[0]?.earliestCheckIn ?? today}
                maxCheckOut={maxCheckout ?? undefined}
                showCheckOut={intent === 'fixed'}
                disabled={loading || Boolean(fetchError)}
                horizonEnd={horizonEnd}
                reservationsByBed={reservationsByBed}
                futureReservations={combinedReservations}
                summary={staySummary}
              />

              {intent === 'fixed' && fixedNights > 0 && staySummary ? (
                <div
                  className={
                    dark
                      ? 'rounded-xl border border-white/10 bg-white/5 p-4'
                      : 'rounded-xl border border-zinc-200 bg-zinc-50 p-4'
                  }
                >
                  <p className={`text-xs font-semibold uppercase tracking-wide ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
                    Price breakdown
                  </p>
                  <dl className={`mt-3 space-y-2 text-sm ${dark ? 'text-apg-silver' : 'text-zinc-600'}`}>
                    <div className="flex justify-between gap-2">
                      <dt>Rent</dt>
                      <dd className="font-medium text-apg-orange">{paiseToInr(staySummary.accommodationPaise)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Electricity</dt>
                      <dd className="text-xs">Est. based on usage</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Deposit</dt>
                      <dd className={`font-medium ${dark ? 'text-white' : 'text-zinc-900'}`}>{paiseToInr(staySummary.depositPaise)}</dd>
                    </div>
                  </dl>
                  <p className={`mt-3 text-base font-bold ${dark ? 'text-white' : 'text-zinc-900'}`}>
                    Total today:{' '}
                    <span className="text-apg-orange">{paiseToInr(staySummary.totalDuePaise)}</span>
                  </p>
                  <p className={`mt-2 text-[11px] ${dark ? 'text-apg-muted' : 'text-zinc-500'}`}>
                    Billing cycle: {STAY_CHECK_IN_TIME} → {STAY_CHECK_OUT_TIME} next day
                  </p>
                </div>
              ) : null}

              {intent === 'indefinite' && openEndedSummary ? (
                <div
                  className={
                    dark
                      ? 'rounded-xl border border-white/10 bg-white/5 p-4'
                      : 'rounded-xl border border-zinc-200 bg-zinc-50 p-4'
                  }
                >
                  <p className={`text-xs font-semibold uppercase tracking-wide ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
                    Price breakdown
                  </p>
                  <dl className={`mt-3 space-y-2 text-sm ${dark ? 'text-apg-silver' : 'text-zinc-600'}`}>
                    <div className="flex justify-between gap-2">
                      <dt>Rent</dt>
                      <dd className="font-medium text-apg-orange">{paiseToInr(openEndedSummary.rentPaise)}/mo</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Electricity</dt>
                      <dd className="text-xs">Est. based on usage</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Deposit</dt>
                      <dd className={`font-medium ${dark ? 'text-white' : 'text-zinc-900'}`}>{paiseToInr(openEndedSummary.depositPaise)}</dd>
                    </div>
                  </dl>
                  <p className={`mt-3 text-base font-bold ${dark ? 'text-white' : 'text-zinc-900'}`}>
                    Total today:{' '}
                    <span className="text-apg-orange">{paiseToInr(openEndedSummary.totalPaise)}</span>
                  </p>
                  <p className={`mt-2 text-[11px] ${dark ? 'text-apg-muted' : 'text-zinc-500'}`}>
                    Billing cycle: {STAY_CHECK_IN_TIME} → {STAY_CHECK_OUT_TIME} next day
                  </p>
                </div>
              ) : null}

              {intent === 'fixed' && stayRangeConflict ? (
                <p
                  className={
                    dark
                      ? 'rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100'
                      : 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900'
                  }
                >
                  {stayRangeConflict}
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
            Reserve bed →
          </button>
        </div>
      </div>
    </div>
  );
}
