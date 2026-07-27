'use client';

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { BookingReviewCard, type BookingReviewData } from './BookingReviewCard';
import { BookingInlineAuth } from './BookingInlineAuth';
import { CouponCodeField } from '@/src/components/customer/CouponCodeField';
import {
  createBookingAction,
  type BookingActionState,
} from '@/app/(customer)/booking/new/actions';
import type { StayType } from '@/src/lib/stayType';
import { computeNewBookingCheckoutTotals } from '@/src/lib/billing/bookingCheckoutTotals';
import {
  appliedBookingCouponDiscountPaise,
  type AppliedBookingCoupon,
} from '@/src/lib/booking/bookingCouponReview';
import {
  BOOKING_CREATE_PENDING_START_MS,
  BOOKING_CREATE_TIMEOUT_MESSAGE,
  BOOKING_CREATE_TIMEOUT_MS,
  bookingFlowReducer,
  isBookingFlowBusy,
  isStuckCreateSubmit,
  logBookingFlowStep,
  shouldRecoverStuckContinue,
  type BookingFlowStep,
} from '@/src/lib/booking/bookingFlowMachine';

const INITIAL_STATE: BookingActionState = { status: 'idle' };

type AppliedCouponState = AppliedBookingCoupon;

function reviewCouponStorageKey(bedIds: string[], startDate: string, endDate: string | null): string {
  return `apg:booking-coupon:${bedIds.slice().sort().join(',')}:${startDate}:${endDate ?? 'open'}`;
}

function readStoredCoupon(key: string): AppliedCouponState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppliedCouponState;
    if (!parsed?.code || typeof parsed.discountPaise !== 'number' || parsed.discountPaise <= 0) {
      return null;
    }
    return {
      code: String(parsed.code).toUpperCase(),
      discountPaise: parsed.discountPaise,
      label: parsed.label,
    };
  } catch {
    return null;
  }
}

function writeStoredCoupon(key: string, applied: AppliedCouponState | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!applied) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(applied));
  } catch {
    // ignore quota / private mode
  }
}

function buildBookingFormData(input: {
  startDate: string;
  endDate: string | null;
  durationMode: string;
  stayType: string;
  bedIds: string[];
  couponCode?: string | null;
}): FormData {
  const fd = new FormData();
  fd.set('startDate', input.startDate);
  if (input.endDate) fd.set('endDate', input.endDate);
  fd.set('durationMode', input.durationMode);
  fd.set('stayType', input.stayType);
  for (const id of input.bedIds) {
    fd.append('bedId', id);
  }
  if (input.couponCode?.trim()) {
    fd.set('couponCode', input.couponCode.trim().toUpperCase());
  }
  return fd;
}

type Props = {
  isLoggedIn: boolean;
  review: BookingReviewData;
  bedIds: string[];
  startDate: string;
  endDate: string | null;
  stayType: StayType;
  durationMode: 'daily' | 'weekly' | 'monthly' | 'open_ended' | 'fixed_stay';
  customerId?: string;
  customerEmail?: string;
  customerPhone?: string;
};

export function BookingReviewFlow({
  isLoggedIn,
  review,
  bedIds,
  startDate,
  endDate,
  stayType,
  durationMode,
  customerId,
  customerEmail,
  customerPhone,
}: Props) {
  const router = useRouter();
  const submitGuardRef = useRef(false);
  const redirectedRef = useRef(false);
  const sawPendingRef = useRef(false);
  const isPendingRef = useRef(false);
  const actionStatusRef = useRef<BookingActionState['status']>('idle');
  const [step, dispatchStep] = useReducer(bookingFlowReducer, 'REVIEW' as BookingFlowStep);
  const [clientError, setClientError] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(createBookingAction, INITIAL_STATE);

  isPendingRef.current = isPending;
  actionStatusRef.current = state.status;
  if (isPending) {
    sawPendingRef.current = true;
  }

  const couponStorageKey = useMemo(
    () => reviewCouponStorageKey(bedIds, startDate, endDate),
    [bedIds, endDate, startDate],
  );

  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCouponState | null>(null);
  const [couponHydrated, setCouponHydrated] = useState(false);
  const skipNextWriteRef = useRef(false);

  const discountPaise = appliedBookingCouponDiscountPaise(appliedCoupon);

  useEffect(() => {
    const stored = readStoredCoupon(couponStorageKey);
    skipNextWriteRef.current = true;
    setAppliedCoupon(stored);
    setCouponHydrated(true);
    logBookingFlowStep('REVIEW', {
      event: 'coupon_hydrate',
      key: couponStorageKey,
      restored: Boolean(stored),
      code: stored?.code ?? null,
      discountPaise: stored?.discountPaise ?? 0,
    });
  }, [couponStorageKey]);

  useEffect(() => {
    if (!couponHydrated) return;
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }
    writeStoredCoupon(couponStorageKey, appliedCoupon);
  }, [appliedCoupon, couponHydrated, couponStorageKey]);

  const depositRequiredPaise = review.depositRequiredPaise ?? review.depositPaise;
  const depositCreditAppliedPaise = review.depositCreditAppliedPaise ?? 0;
  const priorOutstandingPaise = review.priorOutstandingPaise ?? 0;

  const liveTotals = useMemo(
    () =>
      computeNewBookingCheckoutTotals({
        rentSubtotalPaise: review.rentPaise,
        depositRequiredPaise,
        depositCreditAppliedPaise,
        discountPaise,
        priorOutstanding:
          priorOutstandingPaise > 0
            ? { totalPaise: priorOutstandingPaise, items: [] }
            : null,
      }),
    [
      depositCreditAppliedPaise,
      depositRequiredPaise,
      discountPaise,
      priorOutstandingPaise,
      review.rentPaise,
    ],
  );

  useEffect(() => {
    logBookingFlowStep('REVIEW', {
      isLoggedIn,
      discountPaise,
      appliedCode: appliedCoupon?.code ?? null,
      totalToCollectTodayPaise: liveTotals.totalToCollectTodayPaise,
      rentDuePaise: liveTotals.rentDuePaise,
    });
  }, [
    isLoggedIn,
    discountPaise,
    appliedCoupon?.code,
    liveTotals.totalToCollectTodayPaise,
    liveTotals.rentDuePaise,
  ]);

  useEffect(() => {
    logBookingFlowStep(step, {
      isPending,
      submitGuard: submitGuardRef.current,
      actionStatus: state.status,
      sawPending: sawPendingRef.current,
    });
  }, [step, isPending, state.status]);

  const handleAppliedCouponChange = useCallback((next: AppliedCouponState | null) => {
    setAppliedCoupon(next);
    logBookingFlowStep('REVIEW', {
      event: 'coupon_applied_change',
      code: next?.code ?? null,
      discountPaise: next?.discountPaise ?? 0,
    });
  }, []);

  const failCreateClient = useCallback((reason: string) => {
    submitGuardRef.current = false;
    sawPendingRef.current = false;
    dispatchStep({ type: 'CREATE_TIMEOUT' });
    setClientError(BOOKING_CREATE_TIMEOUT_MESSAGE);
    logBookingFlowStep('FAILED', { reason });
  }, []);

  const submitCreateBooking = useCallback(() => {
    if (submitGuardRef.current) {
      logBookingFlowStep('CREATE_BOOKING', {
        skipped: 'duplicate_submit',
        isPending: isPendingRef.current,
        actionStatus: actionStatusRef.current,
        sawPending: sawPendingRef.current,
      });
      return;
    }

    const fd = buildBookingFormData({
      startDate,
      endDate,
      durationMode,
      stayType,
      bedIds,
      couponCode: appliedCoupon?.code ?? null,
    });

    submitGuardRef.current = true;
    sawPendingRef.current = false;
    setClientError(null);
    dispatchStep({ type: 'CREATE_START' });
    logBookingFlowStep('CREATE_BOOKING', {
      event: 'form_action_dispatch',
      couponCode: appliedCoupon?.code ?? null,
      discountPaise,
      totalToCollectTodayPaise: liveTotals.totalToCollectTodayPaise,
      bedCount: bedIds.length,
      payloadKeys: Array.from(fd.keys()),
    });

    // Prefer direct useActionState dispatch — requestSubmit() can flicker isPending
    // without ever delivering a terminal state (silent Continue death).
    startTransition(() => {
      formAction(fd);
    });
  }, [
    appliedCoupon?.code,
    bedIds,
    discountPaise,
    durationMode,
    endDate,
    formAction,
    liveTotals.totalToCollectTodayPaise,
    startDate,
    stayType,
  ]);

  useEffect(() => {
    if (!isLoggedIn || step !== 'AUTH_REQUIRED') return;
    dispatchStep({ type: 'AUTH_COMPLETE' });
    submitCreateBooking();
  }, [isLoggedIn, step, submitCreateBooking]);

  useEffect(() => {
    if (state.status === 'idle') return;

    if (state.status === 'error') {
      submitGuardRef.current = false;
      sawPendingRef.current = false;
      dispatchStep({ type: 'CREATE_ERROR' });
      setClientError(state.message);
      logBookingFlowStep('FAILED', {
        reason: 'action_error',
        message: state.message,
      });
      return;
    }

    if (state.status === 'success' && !redirectedRef.current) {
      redirectedRef.current = true;
      submitGuardRef.current = false;
      sawPendingRef.current = false;
      dispatchStep({ type: 'CREATE_SUCCESS' });
      writeStoredCoupon(couponStorageKey, null);
      logBookingFlowStep('REDIRECT_PAYMENT', {
        bookingId: state.bookingId,
        bookingCode: state.bookingCode,
        nextRoute: state.nextRoute,
      });
      router.replace(state.nextRoute);
    }
  }, [state, router, couponStorageKey]);

  // Hung while pending.
  useEffect(() => {
    if (step !== 'CREATE_BOOKING' || !isPending) return;

    const timer = window.setTimeout(() => {
      if (!submitGuardRef.current) return;
      failCreateClient('client_timeout_pending');
    }, BOOKING_CREATE_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [step, isPending, failCreateClient]);

  // Only if pending NEVER started after dispatch (broken action wiring).
  useEffect(() => {
    if (step !== 'CREATE_BOOKING' || isPending || state.status !== 'idle') return;
    if (!submitGuardRef.current) return;

    const timer = window.setTimeout(() => {
      if (
        !isStuckCreateSubmit({
          step: 'CREATE_BOOKING',
          submitGuard: submitGuardRef.current,
          actionPending: isPendingRef.current,
          actionStatus:
            actionStatusRef.current === 'idle'
              ? 'idle'
              : actionStatusRef.current === 'error'
                ? 'error'
                : 'success',
          sawActionPending: sawPendingRef.current,
        })
      ) {
        return;
      }
      failCreateClient('client_timeout_pending_never_started');
    }, BOOKING_CREATE_PENDING_START_MS);

    return () => window.clearTimeout(timer);
  }, [step, isPending, state.status, failCreateClient]);

  function handleRetry() {
    redirectedRef.current = false;
    sawPendingRef.current = false;
    dispatchStep({ type: 'RESET' });
    setClientError(null);
    submitGuardRef.current = false;
    logBookingFlowStep('REVIEW', { event: 'retry_reset' });
  }

  function handleContinue() {
    logBookingFlowStep(step, {
      event: 'continue_click',
      isLoggedIn,
      isPending,
      submitGuard: submitGuardRef.current,
      actionStatus: state.status,
      appliedCode: appliedCoupon?.code ?? null,
      checkoutTotals: liveTotals,
    });

    // Success already returned but navigation may have failed — retry redirect.
    if (state.status === 'success' && state.nextRoute) {
      logBookingFlowStep('REDIRECT_PAYMENT', {
        event: 'retry_redirect',
        nextRoute: state.nextRoute,
      });
      router.replace(state.nextRoute);
      return;
    }

    if (step === 'FAILED') {
      handleRetry();
      if (!isLoggedIn) {
        dispatchStep({ type: 'CONTINUE_GUEST' });
        logBookingFlowStep('AUTH_REQUIRED', { event: 'guest_after_failed' });
        return;
      }
      dispatchStep({ type: 'CONTINUE_SIGNED_IN' });
      submitCreateBooking();
      return;
    }

    if (
      shouldRecoverStuckContinue({
        step,
        submitGuard: submitGuardRef.current,
      })
    ) {
      logBookingFlowStep('CREATE_BOOKING', { event: 'recover_stuck_continue' });
      handleRetry();
      if (!isLoggedIn) {
        dispatchStep({ type: 'CONTINUE_GUEST' });
        logBookingFlowStep('AUTH_REQUIRED', { event: 'guest_after_recover' });
        return;
      }
      dispatchStep({ type: 'CONTINUE_SIGNED_IN' });
      submitCreateBooking();
      return;
    }

    if (!isLoggedIn) {
      dispatchStep({ type: 'CONTINUE_GUEST' });
      logBookingFlowStep('AUTH_REQUIRED', { event: 'guest_continue' });
      return;
    }

    dispatchStep({ type: 'CONTINUE_SIGNED_IN' });
    submitCreateBooking();
  }

  const busy = isBookingFlowBusy(step, isPending);
  const errorMessage = clientError ?? (state.status === 'error' ? state.message : null);
  const showContinue = step !== 'AUTH_REQUIRED' || isLoggedIn;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <BookingReviewCard
        data={{
          ...review,
          depositPaise: liveTotals.depositDueNowPaise,
        }}
        discountPaise={discountPaise}
        couponCode={appliedCoupon?.code ?? null}
        couponLabel={appliedCoupon?.label ?? null}
        totalDuePaise={liveTotals.totalToCollectTodayPaise}
        couponSection={
          couponHydrated ? (
            <CouponCodeField
              subtotalPaise={review.rentPaise}
              context="booking_checkout"
              variant="dark"
              customerId={customerId}
              customerEmail={customerEmail}
              customerPhone={customerPhone}
              title="Have a Coupon Code?"
              omitInputName
              initialCode={appliedCoupon?.code ?? ''}
              initialApplied={Boolean(appliedCoupon)}
              initialDiscountPaise={appliedCoupon?.discountPaise ?? 0}
              initialLabel={appliedCoupon?.label ?? null}
              onAppliedChange={handleAppliedCouponChange}
            />
          ) : null
        }
      />

      {step === 'AUTH_REQUIRED' && !isLoggedIn ? (
        <BookingInlineAuth
          onAuthenticated={() => {
            logBookingFlowStep('AUTH_REQUIRED', { event: 'otp_verified' });
            router.refresh();
          }}
        />
      ) : null}

      {errorMessage ? (
        <div className="space-y-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <p>{errorMessage}</p>
          {step === 'FAILED' ? (
            <button
              type="button"
              onClick={() => {
                handleRetry();
                if (isLoggedIn) submitCreateBooking();
                else {
                  dispatchStep({ type: 'CONTINUE_GUEST' });
                }
              }}
              className="text-xs font-semibold text-rose-100 underline"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Hidden fields kept for progressive enhancement / inspection; submit uses FormData builder. */}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          handleContinue();
        }}
      >
        <input type="hidden" name="startDate" value={startDate} />
        {endDate ? <input type="hidden" name="endDate" value={endDate} /> : null}
        <input type="hidden" name="durationMode" value={durationMode} />
        <input type="hidden" name="stayType" value={stayType} />
        {bedIds.map((id) => (
          <input key={id} type="hidden" name="bedId" value={id} />
        ))}
        {appliedCoupon?.code ? (
          <input type="hidden" name="couponCode" value={appliedCoupon.code} />
        ) : null}

        {showContinue ? (
          <button
            type="submit"
            disabled={busy}
            className="flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-apg-orange text-base font-bold text-white shadow-[0_0_32px_rgba(255,90,31,0.35)] transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'Confirming your booking…' : step === 'FAILED' ? 'Try again' : 'Continue'}
          </button>
        ) : null}
      </form>

      {isLoggedIn ? (
        <p className="text-center text-xs text-apg-silver">
          Signed in. Continue creates your booking and opens payment.
        </p>
      ) : step === 'REVIEW' ? (
        <p className="text-center text-xs text-apg-silver">
          You&apos;ll sign in only if needed — your choices stay saved.
        </p>
      ) : null}
    </div>
  );
}
