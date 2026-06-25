'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trackClientEvent } from '@/src/lib/analytics/client';
import { addDays, diffDays, formatDate, parseDate, todayString } from '@/src/lib/dates';
import { defaultCheckOutDate } from '@/src/lib/dateDefaults';
import { formatDate as formatDisplayDate } from '@/src/lib/format';
import {
  quoteToBookingDraftPricing,
  bookingDraftToSummaryData,
  type BookingDraftStatus,
} from '@/src/lib/booking/bookingDraft';
import { checkoutCapMessage } from '@/src/lib/bedAvailabilityWindows';
import {
  isCheckInAvailableForReservations,
  isStayRangeAvailableForAllBeds,
  maxCheckoutForAllBeds,
} from '@/src/lib/bedStayOverlap';
import { reserveBufferDate } from '@/src/lib/bedReservePolicy';
import {
  FIXED_DATE_MAX_NIGHTS,
  pricingModeFromStayType,
  stayTypeChoiceDescription,
  stayTypeLabel,
  validateFixedDateStay,
  type StayType,
} from '@/src/lib/stayType';
import type { BedSelectorBed } from './BedSelector';
import { StayDateRangePicker } from './StayDateRangePicker';
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
  suggestedCheckIn?: string;
  presentation?: 'center' | 'bottomSheet';
};

type WizardStep = 'stayType' | 'dates';

type ServerBookingQuote = {
  subtotalPaise: number;
  depositPaise: number;
  totalPaise: number;
};

function validateDatesForNavigation(input: {
  isMonthly: boolean;
  start: string;
  end: string | null;
  today: string;
  timelines: BedTimelineResponse[];
  reservationsByBed: Array<Array<{ startDate: string; endDate: string }>>;
  maxCheckout: string | null | undefined;
  availabilityEnd: string;
}): string | null {
  if (input.timelines.some((t) => t.bedStatus !== 'available')) {
    return 'One or more selected beds cannot be booked.';
  }

  const earliest = input.timelines
    .map((t) => t.earliestCheckIn)
    .filter((d): d is string => Boolean(d))
    .sort()[0];

  const checkInOk = input.reservationsByBed.every((res) =>
    isCheckInAvailableForReservations(input.start, res, earliest ?? input.today),
  );
  if (!checkInOk) {
    return 'The selected check-in date is not available for these beds.';
  }

  const checkout = input.isMonthly ? input.availabilityEnd : input.end;
  if (!checkout) {
    return 'Please select your check-out date.';
  }

  if (!input.isMonthly && input.end! <= input.start) {
    return 'Check-out must be after check-in.';
  }

  if (!input.isMonthly) {
    const fixedErr = validateFixedDateStay(input.start, input.end!, input.today);
    if (fixedErr) return fixedErr;
  }

  if (!isStayRangeAvailableForAllBeds(input.start, checkout, input.reservationsByBed)) {
    return 'The selected dates overlap an existing reservation for one or more beds.';
  }

  if (!input.isMonthly) {
    const cap = input.maxCheckout;
    if (!cap || input.end! > cap) {
      return cap
        ? checkoutCapMessage(cap)
        : 'Invalid stay dates for the selected beds.';
    }
  }

  return null;
}

/**
 * Book flow: stay type → dates → booking summary (no review popup, no Continue buttons).
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
  const navigateOnceRef = useRef(false);

  const [step, setStep] = useState<WizardStep>(shortStayOnly ? 'dates' : 'stayType');
  const [stayType, setStayType] = useState<StayType>(
    shortStayOnly ? 'fixed_date_stay' : 'monthly_stay',
  );
  const [draftStatus, setDraftStatus] = useState<BookingDraftStatus>(
    shortStayOnly ? 'selecting_dates' : 'empty',
  );
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [timelines, setTimelines] = useState<BedTimelineResponse[]>([]);
  const [minCheckIn, setMinCheckIn] = useState(today);

  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [serverQuote, setServerQuote] = useState<ServerBookingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const isMonthly = stayType === 'monthly_stay';
  const mode = pricingModeFromStayType(stayType);
  const fixedNights =
    !isMonthly && start && end && end > start
      ? diffDays(parseDate(start), parseDate(end))
      : 0;

  const resetDateFlow = useCallback(() => {
    setStart(null);
    setEnd(null);
    setFlowError(null);
    setQuoteError(null);
    setServerQuote(null);
    setQuoteLoading(false);
    setDraftStatus('selecting_dates');
    navigateOnceRef.current = false;
  }, []);

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
      let earliestCheckIn = earliest ?? today;
      if (suggestedCheckIn && suggestedCheckIn >= earliestCheckIn) {
        earliestCheckIn = suggestedCheckIn;
      }
      setMinCheckIn(earliestCheckIn);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load availability');
    } finally {
      setLoading(false);
    }
  }, [beds, today, suggestedCheckIn]);

  useEffect(() => {
    void loadTimelines();
  }, [loadTimelines]);

  const reservationsByBed = useMemo(
    () => timelines.map((t) => t.futureReservations),
    [timelines],
  );

  const horizonEnd = timelines[0]?.windowEnd ?? formatDate(addDays(parseDate(today), 365));

  const maxCheckout = useMemo(() => {
    if (!start) return null;
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

  const availabilityEnd = useMemo(
    () => (start ? defaultCheckOutDate(start) : null),
    [start],
  );

  const combinedReservations = useMemo(
    () => timelines.flatMap((t) => t.futureReservations),
    [timelines],
  );

  const canFetchQuote =
    draftStatus === 'quoting' &&
    beds.length > 0 &&
    !loading &&
    !fetchError &&
    Boolean(start) &&
    (isMonthly || (end != null && fixedNights > 0));

  useEffect(() => {
    if (!canFetchQuote || !start) {
      return;
    }

    let cancelled = false;
    setQuoteLoading(true);
    setQuoteError(null);
    setServerQuote(null);

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
          setDraftStatus('error');
          return;
        }
        setServerQuote(data.quote);
        setDraftStatus('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setServerQuote(null);
          setQuoteError('Could not load price.');
          setDraftStatus('error');
        }
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canFetchQuote, beds, start, end, isMonthly, stayType]);

  const draftPricing = useMemo(() => {
    if (!serverQuote || draftStatus !== 'ready') return null;
    return quoteToBookingDraftPricing({
      subtotalPaise: serverQuote.subtotalPaise,
      depositPaise: serverQuote.depositPaise,
    });
  }, [serverQuote, draftStatus]);

  useEffect(() => {
    if (!funnel) return;
    funnel.setActiveStep(step === 'stayType' ? 'bed' : 'preview');
    const bed = beds[0];
    if (!bed) return;

    const showPricing = draftStatus === 'ready' || draftStatus === 'navigating';
    funnel.patchSummary(
      bookingDraftToSummaryData({
        bedId: bed.bedId,
        bedCode: bed.bedCode,
        stayType,
        checkIn: showPricing ? (start ?? undefined) : undefined,
        checkOut: showPricing && !isMonthly ? end : null,
        stayNights: showPricing && !isMonthly && fixedNights > 0 ? fixedNights : undefined,
        pricing: showPricing ? draftPricing : null,
      }),
    );
  }, [funnel, beds, stayType, start, end, isMonthly, fixedNights, draftPricing, draftStatus, step]);

  useEffect(() => {
    if (draftStatus !== 'ready' || !serverQuote || !start || navigateOnceRef.current) return;

    const validationMessage = validateDatesForNavigation({
      isMonthly,
      start,
      end,
      today,
      timelines,
      reservationsByBed,
      maxCheckout,
      availabilityEnd: availabilityEnd ?? defaultCheckOutDate(start),
    });

    if (validationMessage) {
      setFlowError(validationMessage);
      setDraftStatus('error');
      return;
    }

    navigateOnceRef.current = true;
    setDraftStatus('navigating');

    const checkout = isMonthly ? availabilityEnd ?? defaultCheckOutDate(start) : end!;
    const params = new URLSearchParams();
    params.set('start', start);
    params.set('end', checkout);
    params.set('stayType', stayType);
    params.set('mode', mode);
    for (const bed of beds) params.append('bed', bed.bedId);

    void trackClientEvent('bed_selected', { bedCount: beds.length, stayType });
    onClose();
    router.push(`/booking/new?${params.toString()}`);
  }, [
    draftStatus,
    serverQuote,
    start,
    end,
    isMonthly,
    availabilityEnd,
    today,
    timelines,
    reservationsByBed,
    maxCheckout,
    stayType,
    mode,
    beds,
    onClose,
    router,
  ]);

  const handleStayTypeSelect = useCallback(
    (next: StayType) => {
      setStayType(next);
      resetDateFlow();
      setStep('dates');
    },
    [resetDateFlow],
  );

  const handleRangeComplete = useCallback(
    (range: { checkIn: string; checkOut: string | null }) => {
      setStart(range.checkIn);
      setEnd(range.checkOut);
      setFlowError(null);
      setQuoteError(null);
      setDraftStatus('quoting');
    },
    [],
  );

  const shell = dark
    ? 'rounded-2xl border border-white/10 apg-glass shadow-2xl'
    : 'rounded-xl border border-zinc-200 bg-white shadow-xl';
  const label = dark ? 'text-xs font-medium text-apg-silver' : 'text-xs font-medium text-zinc-600';
  const btnGhost = dark
    ? 'rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-apg-silver hover:border-white/30 hover:text-white'
    : 'rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50';

  const stayTypeCards = useMemo(() => {
    const cards: Array<{ id: StayType; title: string; description: string }> = [];
    if (!shortStayOnly) {
      cards.push({
        id: 'monthly_stay',
        title: stayTypeLabel('monthly_stay'),
        description: stayTypeChoiceDescription('monthly_stay'),
      });
    }
    cards.push({
      id: 'fixed_date_stay',
      title: stayTypeLabel('fixed_date_stay'),
      description: stayTypeChoiceDescription('fixed_date_stay'),
    });
    return cards;
  }, [shortStayOnly]);

  const showDateStatus =
    draftStatus === 'quoting' || draftStatus === 'navigating' || draftStatus === 'ready';

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
              ? 'How do you want to stay?'
              : isMonthly
                ? 'Pick your check-in date'
                : 'Pick check-in and check-out'}
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
                  {stayTypeCards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => handleStayTypeSelect(card.id)}
                      className={
                        dark
                          ? 'rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-left transition hover:border-white/20'
                          : 'rounded-lg border border-zinc-200 bg-white px-4 py-4 text-left transition hover:border-zinc-300'
                      }
                    >
                      <span
                        className={`text-sm font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}
                      >
                        {card.title}
                      </span>
                      <p
                        className={`mt-2 text-xs leading-relaxed ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}
                      >
                        {card.description}
                      </p>
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {step === 'dates' ? (
              <>
                {shortStayOnly && reserveCheckInDate && reserveLastStay ? (
                  <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-100">
                    This bed is reserved from {formatDisplayDate(reserveCheckInDate)}. Checkout on or
                    before {formatDisplayDate(reserveLastStay)}.
                  </div>
                ) : null}

                {isMonthly ? (
                  <p className={`text-xs ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
                    {VACATING_NOTICE_MIN_DAYS}-day notice when you decide to move out.
                  </p>
                ) : null}

                <StayDateRangePicker
                  key={stayType}
                  resetKey={stayType}
                  theme={dark ? 'dark' : 'light'}
                  layout="inline"
                  showPricing={false}
                  checkIn=""
                  checkOut={null}
                  onCheckInChange={() => undefined}
                  onCheckOutChange={() => undefined}
                  onRangeComplete={handleRangeComplete}
                  minCheckIn={minCheckIn}
                  maxCheckOut={maxCheckout ?? undefined}
                  showCheckOut={!isMonthly}
                  disabled={showDateStatus || loading || Boolean(fetchError)}
                  horizonEnd={horizonEnd}
                  reservationsByBed={reservationsByBed}
                  futureReservations={combinedReservations}
                />

                {showDateStatus ? (
                  <div className="rounded-xl border border-apg-orange/30 bg-apg-orange/10 px-4 py-3 text-center text-sm text-white">
                    {draftStatus === 'navigating'
                      ? 'Opening booking summary…'
                      : 'Calculating your price…'}
                  </div>
                ) : null}

                {(draftStatus === 'error' && (quoteError || flowError)) ? (
                  <div className="space-y-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-3 text-sm text-rose-200">
                    <p>{flowError ?? quoteError}</p>
                    <button
                      type="button"
                      onClick={resetDateFlow}
                      className="text-xs font-semibold text-rose-100 underline"
                    >
                      Choose different dates
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>

      <div className="sticky bottom-0 flex shrink-0 justify-between gap-2 border-t border-white/10 bg-[#161b22] px-4 py-4 sm:px-5">
        {step === 'dates' && !shortStayOnly ? (
          <button
            type="button"
            onClick={() => {
              resetDateFlow();
              setStep('stayType');
            }}
            className={`text-sm font-medium ${dark ? 'text-apg-silver hover:text-white' : 'text-zinc-600'}`}
          >
            ← Change stay type
          </button>
        ) : (
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
        )}
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
