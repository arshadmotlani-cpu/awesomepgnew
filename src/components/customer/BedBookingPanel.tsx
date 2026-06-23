'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trackClientEvent } from '@/src/lib/analytics/client';
import { addDays, diffDays, formatDate, parseDate, todayString } from '@/src/lib/dates';
import { defaultCheckOutDate } from '@/src/lib/dateDefaults';
import { formatDate as formatDisplayDate, paiseToInr } from '@/src/lib/format';
import { checkoutCapMessage } from '@/src/lib/bedAvailabilityWindows';
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
import { MobileBottomSheet } from '@/src/components/customer/block/MobileBottomSheet';

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

type WizardStep = 'plan' | 'dates' | 'review';
type StayPlan = 'monthly' | 'weekly' | 'daily';
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

function planToIntent(plan: StayPlan): StayIntent {
  return plan === 'monthly' ? 'indefinite' : 'fixed';
}

function defaultEndForPlan(start: string, plan: StayPlan): string {
  if (plan === 'monthly') return defaultCheckOutDate(start);
  if (plan === 'weekly') return formatDate(addDays(parseDate(start), 7));
  return formatDate(addDays(parseDate(start), 1));
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
  suggestedCheckIn,
  presentation = 'center',
}: Props) {
  const dark = theme === 'dark';
  const router = useRouter();
  const today = todayString();
  const reserveLastStay = reserveCheckInDate ? reserveBufferDate(reserveCheckInDate) : null;

  const [step, setStep] = useState<WizardStep>('plan');
  const [plan, setPlan] = useState<StayPlan>(shortStayOnly ? 'weekly' : 'monthly');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [timelines, setTimelines] = useState<BedTimelineResponse[]>([]);

  const intent = planToIntent(plan);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(() => defaultEndForPlan(today, shortStayOnly ? 'weekly' : 'monthly'));
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
      const initialPlan = shortStayOnly ? 'weekly' : 'monthly';
      let initialStart = earliest ?? today;
      if (suggestedCheckIn && suggestedCheckIn >= initialStart) {
        initialStart = suggestedCheckIn;
      }
      setStart(initialStart);
      setEnd(defaultEndForPlan(initialStart, initialPlan));
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

  const durationHint = useMemo(() => {
    if (intent === 'indefinite') {
      const rentPaise = beds.reduce((sum, bed) => sum + bed.monthlyRatePaise, 0);
      return `Monthly · ${paiseToInr(rentPaise)}/mo`;
    }
    const nights = fixedNights > 0 ? fixedNights : plan === 'weekly' ? 7 : 1;
    const rentPaise = beds.reduce(
      (sum, bed) => sum + estimateFixedStaySubtotal(bed, nights),
      0,
    );
    return `${nights} night${nights === 1 ? '' : 's'} · ${paiseToInr(rentPaise)}`;
  }, [intent, fixedNights, plan, beds]);

  function handlePlanSelect(next: StayPlan) {
    setPlan(next);
    setValidationError(null);
    const nextIntent = planToIntent(next);
    if (nextIntent === 'fixed') {
      setEnd(defaultEndForPlan(start, next));
    }
  }

  function handleStartChange(value: string) {
    setStart(value);
    setValidationError(null);
    if (intent === 'fixed') {
      const cap = maxCheckoutForAllBeds(value, reservationsByBed, horizonEnd);
      const preferred = defaultEndForPlan(value, plan);
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
  const btnPrimary = dark
    ? 'rounded-lg bg-apg-orange px-5 py-2.5 text-sm font-semibold text-white apg-glow-btn hover:brightness-110 disabled:opacity-40'
    : 'rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40';
  const btnGhost = dark
    ? 'rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-apg-silver hover:border-white/30 hover:text-white'
    : 'rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50';

  type PlanCard = {
    id: StayPlan;
    title: string;
    subtitle: string;
    priceLabel: string;
    depositLabel: string;
  };

  const planCards: PlanCard[] = useMemo(() => {
    const primary = beds[0];
    if (!primary) return [];
    const weeklyRent = estimateFixedStaySubtotal(primary, 7);
    const dailyRent = estimateFixedStaySubtotal(primary, 1);
    const monthlyRent = primary.monthlyRatePaise;
    const cards: PlanCard[] = [];
    if (!shortStayOnly) {
      cards.push({
        id: 'monthly',
        title: 'Monthly',
        subtitle: 'Stay as long as you want · monthly billing',
        priceLabel: monthlyRent > 0 ? `${paiseToInr(monthlyRent)}/mo` : '—',
        depositLabel:
          displayMonthlyDepositPaise(primary) > 0
            ? `${paiseToInr(displayMonthlyDepositPaise(primary))} deposit (2× rent)`
            : 'No deposit',
      });
    }
    cards.push(
      {
        id: 'weekly',
        title: 'Weekly',
        subtitle: 'Fixed stay · 7 nights by default',
        priceLabel: weeklyRent > 0 ? `${paiseToInr(weeklyRent)}/wk` : '—',
        depositLabel:
          depositPreview(primary, 'fixed_stay', 7) > 0
            ? `~${paiseToInr(depositPreview(primary, 'fixed_stay', 7))} deposit (50%)`
            : 'No deposit',
      },
      {
        id: 'daily',
        title: 'Daily',
        subtitle: 'Fixed stay · 1 night by default',
        priceLabel: dailyRent > 0 ? `${paiseToInr(dailyRent)}/day` : '—',
        depositLabel:
          depositPreview(primary, 'fixed_stay', 1) > 0
            ? `~${paiseToInr(depositPreview(primary, 'fixed_stay', 1))} deposit (50%)`
            : 'No deposit',
      },
    );
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
            {step === 'plan'
              ? 'How long are you planning to stay?'
              : step === 'dates'
                ? 'Pick your check-in and check-out'
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
            {step === 'plan' ? (
              <fieldset className="space-y-3">
                <legend className={`${label} mb-1`}>How long are you planning to stay?</legend>
                <div className="grid grid-cols-1 gap-3">
                  {planCards.map((card) => {
                    const selected = plan === card.id;
                    const highlight =
                      card.id === 'monthly' && !shortStayOnly && selected;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => handlePlanSelect(card.id)}
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
                        <p className={`mt-1 text-[11px] ${dark ? 'text-apg-muted' : 'text-zinc-400'}`}>
                          {card.depositLabel}
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
              </>
            ) : null}

            {step === 'review' ? (
              <div
                className={
                  dark
                    ? 'rounded-xl border border-white/10 bg-white/5 p-4'
                    : 'rounded-xl border border-zinc-200 bg-zinc-50 p-4'
                }
              >
                <p
                  className={`text-xs font-semibold uppercase tracking-wide ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}
                >
                  Booking summary
                </p>
                <dl className={`mt-3 space-y-2 text-sm ${dark ? 'text-apg-silver' : 'text-zinc-600'}`}>
                  <div className="flex justify-between gap-2">
                    <dt>Bed{beds.length > 1 ? 's' : ''}</dt>
                    <dd className={`font-medium ${dark ? 'text-white' : 'text-zinc-900'}`}>
                      {beds.map((b) => b.bedCode).join(', ')}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Plan</dt>
                    <dd className={`font-medium capitalize ${dark ? 'text-white' : 'text-zinc-900'}`}>
                      {plan}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Check-in</dt>
                    <dd className={`font-medium ${dark ? 'text-white' : 'text-zinc-900'}`}>
                      {formatDisplayDate(start)}
                    </dd>
                  </div>
                  {intent === 'fixed' ? (
                    <div className="flex justify-between gap-2">
                      <dt>Check-out</dt>
                      <dd className={`font-medium ${dark ? 'text-white' : 'text-zinc-900'}`}>
                        {formatDisplayDate(end)}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-2">
                    <dt>Duration</dt>
                    <dd className={`font-medium ${dark ? 'text-white' : 'text-zinc-900'}`}>
                      {intent === 'fixed'
                        ? `${fixedNights} night${fixedNights === 1 ? '' : 's'}`
                        : 'Open-ended (monthly billing)'}
                    </dd>
                  </div>
                  {intent === 'fixed' && staySummary ? (
                    <>
                      <div className="flex justify-between gap-2">
                        <dt>Rent</dt>
                        <dd className="font-medium text-apg-orange">
                          {paiseToInr(staySummary.accommodationPaise)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Deposit</dt>
                        <dd className={`font-medium ${dark ? 'text-white' : 'text-zinc-900'}`}>
                          {paiseToInr(staySummary.depositPaise)}
                        </dd>
                      </div>
                    </>
                  ) : null}
                  {intent === 'indefinite' && openEndedSummary ? (
                    <>
                      <div className="flex justify-between gap-2">
                        <dt>Rent</dt>
                        <dd className="font-medium text-apg-orange">
                          {paiseToInr(openEndedSummary.rentPaise)}/mo
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Deposit</dt>
                        <dd className={`font-medium ${dark ? 'text-white' : 'text-zinc-900'}`}>
                          {paiseToInr(openEndedSummary.depositPaise)}
                        </dd>
                      </div>
                    </>
                  ) : null}
                </dl>
                <p className={`mt-4 text-base font-bold ${dark ? 'text-white' : 'text-zinc-900'}`}>
                  Total due now:{' '}
                  <span className="text-apg-orange">
                    {paiseToInr(
                      intent === 'fixed' && staySummary
                        ? staySummary.totalDuePaise
                        : openEndedSummary?.totalPaise ?? 0,
                    )}
                  </span>
                </p>
                <p className={`mt-2 text-[11px] ${dark ? 'text-apg-muted' : 'text-zinc-500'}`}>
                  Billing cycle: {STAY_CHECK_IN_TIME} → {STAY_CHECK_OUT_TIME} next day
                </p>
              </div>
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

        {step === 'plan' ? (
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
            disabled={loading || Boolean(fetchError) || Boolean(stayRangeConflict)}
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
            disabled={loading || Boolean(fetchError)}
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
