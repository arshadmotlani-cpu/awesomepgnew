'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trackClientEvent } from '@/src/lib/analytics/client';
import { addDays, diffDays, formatDate, parseDate, todayString } from '@/src/lib/dates';
import { defaultCheckOutDate } from '@/src/lib/dateDefaults';
import { formatDate as formatDisplayDate } from '@/src/lib/format';
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
import { getBookingPolicies } from '@/src/lib/booking/bookingPolicies';

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

function buildReviewUrl(input: {
  beds: BedSelectorBed[];
  start: string;
  checkout: string;
  stayType: StayType;
  mode: ReturnType<typeof pricingModeFromStayType>;
}): string {
  const params = new URLSearchParams();
  params.set('start', input.start);
  params.set('end', input.checkout);
  params.set('stayType', input.stayType);
  params.set('mode', input.mode);
  for (const bed of input.beds) params.append('bed', bed.bedId);
  return `/booking/new?${params.toString()}`;
}

/**
 * Book flow: stay type → dates → instant navigation to booking review (no pricing in modal).
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
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [timelines, setTimelines] = useState<BedTimelineResponse[]>([]);
  const [minCheckIn, setMinCheckIn] = useState(today);
  const [selectedCheckIn, setSelectedCheckIn] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);

  const isMonthly = stayType === 'monthly_stay';
  const mode = pricingModeFromStayType(stayType);

  const resetDateFlow = useCallback(() => {
    setFlowError(null);
    setSelectedCheckIn(null);
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

  useEffect(() => {
    if (step === 'dates') {
      router.prefetch('/booking/new');
    }
  }, [step, router]);

  const reservationsByBed = useMemo(
    () => timelines.map((t) => t.futureReservations),
    [timelines],
  );

  const horizonEnd = timelines[0]?.windowEnd ?? formatDate(addDays(parseDate(today), 365));

  const maxCheckout = useMemo(() => {
    const checkInAnchor = selectedCheckIn ?? minCheckIn;
    const cap = maxCheckoutForAllBeds(checkInAnchor, reservationsByBed, horizonEnd);
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
  }, [selectedCheckIn, minCheckIn, reservationsByBed, horizonEnd, shortStayOnly, reserveLastStay, isMonthly, today]);

  const combinedReservations = useMemo(
    () => timelines.flatMap((t) => t.futureReservations),
    [timelines],
  );

  useEffect(() => {
    if (!funnel) return;
    funnel.setActiveStep(step === 'stayType' ? 'bed' : 'preview');
  }, [funnel, step]);

  const navigateToReview = useCallback(
    (checkIn: string, checkOut: string | null) => {
      if (navigateOnceRef.current) return;

      const checkout = isMonthly ? defaultCheckOutDate(checkIn) : checkOut;
      if (!checkout) return;

      const validationMessage = validateDatesForNavigation({
        isMonthly,
        start: checkIn,
        end: checkOut,
        today,
        timelines,
        reservationsByBed,
        maxCheckout,
        availabilityEnd: checkout,
      });

      if (validationMessage) {
        setFlowError(validationMessage);
        navigateOnceRef.current = false;
        return;
      }

      navigateOnceRef.current = true;
      const url = buildReviewUrl({ beds, start: checkIn, checkout, stayType, mode });
      void trackClientEvent('bed_selected', { bedCount: beds.length, stayType });
      router.prefetch(url);
      onClose();
      router.push(url);
    },
    [
      isMonthly,
      today,
      timelines,
      reservationsByBed,
      maxCheckout,
      beds,
      stayType,
      mode,
      onClose,
      router,
    ],
  );

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
      setFlowError(null);
      navigateToReview(range.checkIn, range.checkOut);
    },
    [navigateToReview],
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
                    {getBookingPolicies('monthly_stay').noticePolicy.body}
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
                  onCheckInChange={setSelectedCheckIn}
                  onCheckOutChange={() => undefined}
                  onRangeComplete={handleRangeComplete}
                  minCheckIn={minCheckIn}
                  maxCheckOut={maxCheckout ?? undefined}
                  showCheckOut={!isMonthly}
                  disabled={loading || Boolean(fetchError)}
                  horizonEnd={horizonEnd}
                  reservationsByBed={reservationsByBed}
                  futureReservations={combinedReservations}
                />

                {flowError ? (
                  <div className="space-y-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-3 text-sm text-rose-200">
                    <p>{flowError}</p>
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
