'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trackClientEvent } from '@/src/lib/analytics/client';
import { addDays, diffDays, formatDate, parseDate, todayString } from '@/src/lib/dates';
import { defaultCheckOutDate } from '@/src/lib/dateDefaults';
import { formatDate as formatDisplayDate, paiseToInr } from '@/src/lib/format';
import { formatBookingRentPaise } from '@/src/lib/booking/bookingFunnelPricing';
import { checkoutCapMessage } from '@/src/lib/bedAvailabilityWindows';
import {
  isCheckInAvailableForReservations,
  isStayRangeAvailableForAllBeds,
  maxCheckoutForAllBeds,
} from '@/src/lib/bedStayOverlap';
import { reserveBufferDate } from '@/src/lib/bedReservePolicy';
import { computeNewBookingCheckoutTotals } from '@/src/lib/billing/bookingCheckoutTotals';
import { previewFixedStayQuote } from '@/src/lib/pricing/fixedStayOptimizer';
import type { PricingLineItem } from '@/src/lib/pricing/types';
import {
  defaultFixedDateCheckOut,
  FIXED_DATE_MAX_NIGHTS,
  pricingModeFromStayType,
  stayTypeLabel,
  validateFixedDateStay,
  type StayType,
} from '@/src/lib/stayType';
import type { BedSelectorBed } from './BedSelector';
import { StayDateRangePicker, type StayDateSummary } from './StayDateRangePicker';
import { MobileBottomSheet } from '@/src/components/customer/block/MobileBottomSheet';
import { useBookingFunnel } from '@/src/components/customer/checkout/BookingFunnelShell';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/lib/dateDefaults';

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
  /** Prefill check-in for rebooking (e.g. prior checkout + 1 day). */
  suggestedCheckIn?: string;
  presentation?: 'center' | 'bottomSheet';
};

type WizardStep = 'stayType' | 'dates' | 'review';

type ServerBookingQuote = {
  subtotalPaise: number;
  depositPaise: number;
  totalPaise: number;
  perBed: Array<{
    bedId: string;
    subtotalPaise: number;
    depositPaise: number;
    lineItems: PricingLineItem[];
    nights: number | null;
  }>;
};

function estimateFixedStaySubtotal(bed: BedSelectorBed, nights: number): number {
  return previewFixedStayQuote(nights, bed.dailyRatePaise, bed.weeklyRatePaise).subtotalPaise;
}

/**
 * Modal panel for picking stay type and dates after selecting bed(s).
 * Flow: Choose stay type → Select dates → Review price → Submit booking.
 */
export function BedBookingPanel({
  beds,
  theme = 'dark',
  onClose,
  shortStayOnly = false,
  reserveCheckInDate,
  suggestedCheckIn,
  presentation = 'center',
}: Props) {
  const dark = theme === 'dark';
  const router = useRouter();
  const funnel = useBookingFunnel();
  const today = todayString();
  const reserveLastStay = reserveCheckInDate ? reserveBufferDate(reserveCheckInDate) : null;

  const [step, setStep] = useState<WizardStep>('stayType');
  const [stayType, setStayType] = useState<StayType>(
    shortStayOnly ? 'fixed_date_stay' : 'monthly_stay',
  );
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [timelines, setTimelines] = useState<BedTimelineResponse[]>([]);

  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(() =>
    shortStayOnly ? defaultFixedDateCheckOut(today) : defaultCheckOutDate(today),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverQuote, setServerQuote] = useState<ServerBookingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const isMonthly = stayType === 'monthly_stay';
  const mode = pricingModeFromStayType(stayType);
  const fixedNights =
    !isMonthly && end > start ? diffDays(parseDate(start), parseDate(end)) : 0;

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
      const initialStayType: StayType = shortStayOnly ? 'fixed_date_stay' : 'monthly_stay';
      let initialStart = earliest ?? today;
      if (suggestedCheckIn && suggestedCheckIn >= initialStart) {
        initialStart = suggestedCheckIn;
      }
      setStart(initialStart);
      setEnd(
        initialStayType === 'fixed_date_stay'
          ? defaultFixedDateCheckOut(initialStart)
          : defaultCheckOutDate(initialStart),
      );
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load availability');
    } finally {
      setLoading(false);
    }
  }, [beds, today, shortStayOnly, suggestedCheckIn]);

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
    const bookingWindowEnd = formatDate(addDays(parseDate(today), FIXED_DATE_MAX_NIGHTS));
    let effectiveCap = cap;
    if (!isMonthly) {
      if (!effectiveCap || bookingWindowEnd < effectiveCap) {
        effectiveCap = bookingWindowEnd;
      }
    }
    if (shortStayOnly && reserveLastStay) {
      if (!effectiveCap) return reserveLastStay;
      return effectiveCap < reserveLastStay ? effectiveCap : reserveLastStay;
    }
    return effectiveCap;
  }, [start, reservationsByBed, horizonEnd, shortStayOnly, reserveLastStay, isMonthly, today]);

  const availabilityEnd = useMemo(() => defaultCheckOutDate(start), [start]);

  const combinedReservations = useMemo(
    () => timelines.flatMap((t) => t.futureReservations),
    [timelines],
  );

  const fixedDateError = useMemo(() => {
    if (isMonthly || end <= start) return null;
    return validateFixedDateStay(start, end, today);
  }, [isMonthly, start, end, today]);

  const stayRangeConflict = useMemo((): string | null => {
    const checkout = isMonthly ? availabilityEnd : end;
    if (checkout <= start) return null;

    if (!isStayRangeAvailableForAllBeds(start, checkout, reservationsByBed)) {
      return 'The selected dates overlap an existing reservation for one or more beds.';
    }

    if (!isMonthly) {
      const cap = maxCheckoutForAllBeds(start, reservationsByBed, horizonEnd);
      if (cap && end > cap) return checkoutCapMessage(cap);
    }

    return null;
  }, [isMonthly, start, end, availabilityEnd, reservationsByBed, horizonEnd]);

  const canFetchQuote =
    beds.length > 0 &&
    !loading &&
    !fetchError &&
    !stayRangeConflict &&
    !fixedDateError &&
    (isMonthly || fixedNights > 0);

  useEffect(() => {
    if (!canFetchQuote) {
      setServerQuote(null);
      setQuoteError(null);
      return;
    }

    let cancelled = false;
    setQuoteLoading(true);
    setQuoteError(null);

    void fetch('/api/booking/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bedIds: beds.map((b) => b.bedId),
        startDate: start,
        endDate: isMonthly ? null : end,
        stayType,
      }),
    })
      .then(async (res) => res.json())
      .then((data: { ok?: boolean; quote?: ServerBookingQuote; error?: string }) => {
        if (cancelled) return;
        if (!data.ok || !data.quote) {
          setServerQuote(null);
          setQuoteError(data.error ?? 'Could not load price.');
          return;
        }
        setServerQuote(data.quote);
      })
      .catch(() => {
        if (!cancelled) {
          setServerQuote(null);
          setQuoteError('Could not load price.');
        }
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canFetchQuote, beds, start, end, isMonthly, stayType, stayRangeConflict, fixedDateError, loading, fetchError]);

  const checkoutFromQuote = useMemo(() => {
    if (!serverQuote) return null;
    return computeNewBookingCheckoutTotals({
      rentSubtotalPaise: serverQuote.subtotalPaise,
      depositRequiredPaise: serverQuote.depositPaise,
    });
  }, [serverQuote]);

  const staySummary = useMemo((): StayDateSummary | null => {
    if (isMonthly || fixedNights <= 0 || !serverQuote || !checkoutFromQuote) return null;
    const rentLineItems = serverQuote.perBed.flatMap((b) =>
      b.lineItems.filter((li) => li.kind !== 'deposit'),
    );
    return {
      nights: fixedNights,
      dailyRatePaise: beds[0]?.dailyRatePaise ?? 0,
      accommodationPaise: serverQuote.subtotalPaise,
      depositPaise: serverQuote.depositPaise,
      depositDueNowPaise: checkoutFromQuote.depositDueNowPaise,
      totalDuePaise: checkoutFromQuote.totalToCollectTodayPaise,
      rentLineItems,
    };
  }, [isMonthly, fixedNights, beds, serverQuote, checkoutFromQuote]);

  const monthlyCheckout = useMemo(() => {
    if (!isMonthly || !serverQuote || !checkoutFromQuote) return null;
    return checkoutFromQuote;
  }, [isMonthly, serverQuote, checkoutFromQuote]);

  useEffect(() => {
    if (!funnel) return;
    funnel.setActiveStep('bed');
    const bed = beds[0];
    if (!bed) return;
    funnel.patchSummary({
      bedId: bed.bedId,
      bedCode: bed.bedCode,
      stayType,
      moveInDate: start,
      rentPaise: serverQuote?.subtotalPaise ?? bed.monthlyRatePaise,
      depositPaise: serverQuote?.depositPaise,
      totalDuePaise: checkoutFromQuote?.totalToCollectTodayPaise,
    });
  }, [funnel, beds, stayType, start, serverQuote, checkoutFromQuote]);

  const durationHint = useMemo(() => {
    if (isMonthly) {
      const rentPaise = beds.reduce((sum, bed) => sum + bed.monthlyRatePaise, 0);
      return `Monthly Stay · ${paiseToInr(rentPaise)}/mo · ${VACATING_NOTICE_MIN_DAYS}-day notice to leave`;
    }
    const nights = fixedNights > 0 ? fixedNights : 7;
    const rentPaise = beds.reduce(
      (sum, bed) => sum + estimateFixedStaySubtotal(bed, nights),
      0,
    );
    return `Fixed-Date Stay · ${nights} night${nights === 1 ? '' : 's'} · ${paiseToInr(rentPaise)} total`;
  }, [isMonthly, fixedNights, beds]);

  function handleStayTypeSelect(next: StayType) {
    setStayType(next);
    setValidationError(null);
    if (next === 'fixed_date_stay') {
      setEnd(defaultFixedDateCheckOut(start));
    }
  }

  function handleStartChange(value: string) {
    setStart(value);
    setValidationError(null);
    if (!isMonthly) {
      const cap = maxCheckout;
      const preferred = defaultFixedDateCheckOut(value);
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

    const checkout = isMonthly ? availabilityEnd : end;

    if (!isMonthly && end <= start) {
      setValidationError('Check-out must be after check-in.');
      return;
    }

    if (!isMonthly) {
      const fixedErr = validateFixedDateStay(start, end, today);
      if (fixedErr) {
        setValidationError(fixedErr);
        return;
      }
    }

    if (!isStayRangeAvailableForAllBeds(start, checkout, reservationsByBed)) {
      setValidationError('The selected dates overlap an existing reservation for one or more beds.');
      return;
    }

    if (!isMonthly) {
      const cap = maxCheckout;
      if (!cap || end > cap) {
        setValidationError(
          cap ? checkoutCapMessage(cap) : 'Invalid stay dates for the selected beds.',
        );
        return;
      }
    }

    if (quoteLoading) {
      setValidationError('Price is still loading. Please wait a moment.');
      return;
    }
    if (quoteError || !serverQuote) {
      setValidationError(quoteError ?? 'Could not load price. Adjust dates and try again.');
      return;
    }

    const params = new URLSearchParams();
    params.set('start', start);
    params.set('end', checkout);
    params.set('stayType', stayType);
    params.set('mode', mode);
    for (const bed of beds) params.append('bed', bed.bedId);
    void trackClientEvent('bed_selected', { bedCount: beds.length, stayType });
    router.push(`/booking/new?${params.toString()}`);
  }

  const shell = dark
    ? 'rounded-2xl border border-white/10 apg-glass shadow-2xl'
    : 'rounded-xl border border-zinc-200 bg-white shadow-xl';
  const label = dark ? 'text-xs font-medium text-apg-silver' : 'text-xs font-medium text-zinc-600';
  const btnPrimary = dark
    ? 'rounded-lg bg-apg-orange px-5 py-2.5 text-sm font-semibold text-white apg-glow-btn hover:brightness-110 disabled:opacity-40'
    : 'rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40';
  const btnGhost = dark
    ? 'rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-apg-silver hover:border-white/30 hover:text-white'
    : 'rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50';

  type StayTypeCard = {
    id: StayType;
    title: string;
    subtitle: string;
    priceLabel: string;
  };

  const stayTypeCards: StayTypeCard[] = useMemo(() => {
    const primary = beds[0];
    if (!primary) return [];
    const sampleNights = 7;
    const fixedRent = estimateFixedStaySubtotal(primary, sampleNights);
    const monthlyRent = primary.monthlyRatePaise;
    const cards: StayTypeCard[] = [];
    if (!shortStayOnly) {
      cards.push({
        id: 'monthly_stay',
        title: stayTypeLabel('monthly_stay'),
        subtitle: 'Long-term · check-in only · monthly billing until you request move-out',
        priceLabel: monthlyRent > 0 ? formatBookingRentPaise(monthlyRent) : '—',
      });
    }
    cards.push({
      id: 'fixed_date_stay',
      title: stayTypeLabel('fixed_date_stay'),
      subtitle: `Temporary stay · pick check-in and check-out · up to ${FIXED_DATE_MAX_NIGHTS} nights`,
      priceLabel:
        fixedRent > 0
          ? `e.g. ${paiseToInr(fixedRent)} for ${sampleNights} nights`
          : '—',
    });
    return cards;
  }, [beds, shortStayOnly]);

  const panelInner = (
    <div
      className={
        presentation === 'bottomSheet'
          ? 'flex max-h-[calc(88vh-2.5rem)] flex-col overflow-hidden'
          : `w-full max-w-lg max-h-[90vh] overflow-y-auto ${shell}`
      }
    >
      <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-white/10 bg-[#161b22] px-4 py-4 sm:px-5">
        <div>
          <h2
            id="bed-booking-title"
            className={`text-lg font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}
          >
            Book {beds.length === 1 ? `bed ${beds[0]!.bedCode}` : `${beds.length} beds`}
          </h2>
          <p className={`mt-0.5 text-xs ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
            {step === 'stayType'
              ? 'How long are you planning to stay?'
              : step === 'dates'
                ? 'Pick your dates'
                : 'Review before you confirm'}
          </p>
        </div>
        {presentation === 'center' ? (
          <button type="button" onClick={onClose} className={btnGhost} aria-label="Close">
            ✕
          </button>
        ) : null}
      </div>

      <div
        className={
          presentation === 'bottomSheet'
            ? 'min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5'
            : 'space-y-4 px-4 py-4 sm:px-5'
        }
      >
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
            {step === 'stayType' ? (
              <fieldset className="space-y-3">
                <legend className={`${label} mb-1`}>Stay type</legend>
                <div className="grid grid-cols-1 gap-3">
                  {stayTypeCards.map((card) => {
                    const selected = stayType === card.id;
                    const highlight = card.id === 'monthly_stay' && !shortStayOnly && selected;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => handleStayTypeSelect(card.id)}
                        className={
                          dark
                            ? `rounded-xl border px-4 py-3 text-left transition ${
                                selected
                                  ? highlight
                                    ? 'border-emerald-400/60 bg-emerald-500/15 ring-1 ring-emerald-400/30'
                                    : 'border-sky-400/50 bg-sky-500/10 ring-1 ring-sky-400/20'
                                  : 'border-white/10 bg-white/5 hover:border-white/20'
                              }`
                            : `rounded-lg border px-4 py-3 text-left transition ${
                                selected
                                  ? highlight
                                    ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200'
                                    : 'border-sky-500 bg-sky-50 ring-1 ring-sky-200'
                                  : 'border-zinc-200 bg-white hover:border-zinc-300'
                              }`
                        }
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`text-sm font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}
                          >
                            {card.title}
                          </span>
                          <span
                            className={`text-sm font-bold ${dark ? 'text-apg-orange' : 'text-indigo-600'}`}
                          >
                            {card.priceLabel}
                          </span>
                        </div>
                        <p className={`mt-1 text-xs ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
                          {card.subtitle}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            {step === 'dates' ? (
              <>
                {shortStayOnly && reserveCheckInDate && reserveLastStay ? (
                  <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-100">
                    This bed is reserved for someone else from{' '}
                    {formatDisplayDate(reserveCheckInDate)}. Pick dates with checkout on or before{' '}
                    {formatDisplayDate(reserveLastStay)}.
                  </div>
                ) : null}

                {timelines.some((t) => t.futureReservations.length > 0) ? (
                  <div
                    className={
                      dark ? 'rounded-xl border border-white/10 p-3' : 'rounded-lg border border-zinc-200 p-3'
                    }
                  >
                    <p className={`text-xs font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}>
                      Upcoming reservations on this bed
                    </p>
                    <ul
                      className={`mt-2 space-y-1 text-xs ${dark ? 'text-apg-silver' : 'text-zinc-600'}`}
                    >
                      {timelines.flatMap((t) =>
                        t.futureReservations.slice(0, 4).map((r) => (
                          <li key={`${t.bedId}-${r.startDate}-${r.endDate}`}>
                            {formatDisplayDate(r.startDate)} → {formatDisplayDate(r.endDate)}
                            {r.bookingCode ? ` · ${r.bookingCode}` : ''}
                          </li>
                        )),
                      )}
                    </ul>
                  </div>
                ) : null}

                <p
                  className={`text-sm font-semibold ${dark ? 'text-apg-orange' : 'text-orange-600'}`}
                >
                  {durationHint}
                </p>

                <StayDateRangePicker
                  theme={dark ? 'dark' : 'light'}
                  checkIn={start}
                  checkOut={!isMonthly ? end : null}
                  onCheckInChange={handleStartChange}
                  onCheckOutChange={(d) => {
                    setEnd(d);
                    setValidationError(null);
                  }}
                  minCheckIn={timelines[0]?.earliestCheckIn ?? today}
                  maxCheckOut={maxCheckout ?? undefined}
                  showCheckOut={!isMonthly}
                  disabled={loading || Boolean(fetchError)}
                  horizonEnd={horizonEnd}
                  reservationsByBed={reservationsByBed}
                  futureReservations={combinedReservations}
                  summary={staySummary}
                />

                {quoteLoading ? (
                  <p className={`text-sm ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
                    Loading price…
                  </p>
                ) : null}

                {quoteError ? (
                  <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {quoteError}
                  </p>
                ) : null}

                {(fixedDateError || stayRangeConflict) ? (
                  <p
                    className={
                      dark
                        ? 'rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100'
                        : 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900'
                    }
                  >
                    {fixedDateError ?? stayRangeConflict}
                  </p>
                ) : null}
              </>
            ) : null}

            {step === 'review' ? (
              <>
              {quoteLoading ? (
                <p className={`text-sm ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
                  Loading price…
                </p>
              ) : null}

              {quoteError ? (
                <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {quoteError}
                </p>
              ) : checkoutFromQuote ? (
                <p className={`text-sm ${dark ? 'text-apg-silver' : 'text-zinc-600'}`}>
                  Total due today:{' '}
                  <strong className={dark ? 'text-white' : 'text-zinc-900'}>
                    {paiseToInr(checkoutFromQuote.totalToCollectTodayPaise)}
                  </strong>
                  . See the booking summary for the full breakdown.
                </p>
              ) : null}
              </>
            ) : null}

            {validationError ? (
              <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {validationError}
              </p>
            ) : null}
          </>
        )}
      </div>

      <div
        className={
          'sticky bottom-0 flex shrink-0 flex-col-reverse gap-2 border-t border-white/10 bg-[#161b22] px-4 py-4 sm:flex-row sm:justify-end sm:px-5'
        }
      >
        {step === 'review' ? (
          <button
            type="button"
            onClick={() => {
              setValidationError(null);
              setStep('dates');
            }}
            className={`text-sm font-medium ${dark ? 'text-apg-silver hover:text-white' : 'text-zinc-600 hover:text-zinc-900'} sm:mr-auto`}
          >
            Go back
          </button>
        ) : (
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
        )}

        {step === 'stayType' ? (
          <button
            type="button"
            disabled={loading || Boolean(fetchError)}
            onClick={() => setStep('dates')}
            className={btnPrimary}
          >
            Continue →
          </button>
        ) : null}

        {step === 'dates' ? (
          <button
            type="button"
            disabled={
              loading ||
              Boolean(fetchError) ||
              Boolean(stayRangeConflict) ||
              Boolean(fixedDateError) ||
              quoteLoading ||
              Boolean(quoteError) ||
              !serverQuote
            }
            onClick={() => {
              setValidationError(null);
              setStep('review');
            }}
            className={btnPrimary}
          >
            Review booking →
          </button>
        ) : null}

        {step === 'review' ? (
          <button
            type="button"
            disabled={
              loading ||
              Boolean(fetchError) ||
              quoteLoading ||
              Boolean(quoteError) ||
              !serverQuote
            }
            onClick={validateAndContinue}
            className={btnPrimary}
          >
            Confirm booking
          </button>
        ) : null}
      </div>
    </div>
  );

  if (presentation === 'bottomSheet') {
    return (
      <MobileBottomSheet open onClose={onClose} ariaLabelledBy="bed-booking-title">
        {panelInner}
      </MobileBottomSheet>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bed-booking-title"
    >
      {panelInner}
    </div>
  );
}
