'use client';

import {
  useActionState,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { BookingReviewCard, type BookingReviewData } from './BookingReviewCard';
import { BookingInlineAuth } from './BookingInlineAuth';
import {
  createBookingAction,
  type BookingActionState,
} from '@/app/(customer)/booking/new/actions';
import type { StayType } from '@/src/lib/stayType';
import {
  BOOKING_CREATE_TIMEOUT_MESSAGE,
  BOOKING_CREATE_TIMEOUT_MS,
  bookingFlowReducer,
  isBookingFlowBusy,
  logBookingFlowStep,
  type BookingFlowStep,
} from '@/src/lib/booking/bookingFlowMachine';

const INITIAL_STATE: BookingActionState = { status: 'idle' };

type Props = {
  isLoggedIn: boolean;
  review: BookingReviewData;
  bedIds: string[];
  startDate: string;
  endDate: string | null;
  stayType: StayType;
  durationMode: 'daily' | 'weekly' | 'monthly' | 'open_ended' | 'fixed_stay';
};

export function BookingReviewFlow({
  isLoggedIn,
  review,
  bedIds,
  startDate,
  endDate,
  stayType,
  durationMode,
}: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const submitGuardRef = useRef(false);
  const redirectedRef = useRef(false);
  const [step, dispatchStep] = useReducer(bookingFlowReducer, 'REVIEW' as BookingFlowStep);
  const [clientError, setClientError] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(createBookingAction, INITIAL_STATE);

  useEffect(() => {
    logBookingFlowStep('REVIEW', { isLoggedIn });
  }, [isLoggedIn]);

  useEffect(() => {
    logBookingFlowStep(step);
  }, [step]);

  const submitCreateBooking = useCallback(() => {
    if (submitGuardRef.current) {
      logBookingFlowStep('CREATE_BOOKING', { skipped: 'duplicate_submit' });
      return;
    }
    submitGuardRef.current = true;
    setClientError(null);
    dispatchStep({ type: 'CREATE_START' });
    formRef.current?.requestSubmit();
  }, []);

  useEffect(() => {
    if (!isLoggedIn || step !== 'AUTH_REQUIRED') return;
    dispatchStep({ type: 'AUTH_COMPLETE' });
    submitCreateBooking();
  }, [isLoggedIn, step, submitCreateBooking]);

  useEffect(() => {
    if (state.status === 'idle') return;

    if (state.status === 'error') {
      submitGuardRef.current = false;
      dispatchStep({ type: 'CREATE_ERROR' });
      setClientError(state.message);
      return;
    }

    if (state.status === 'success' && !redirectedRef.current) {
      redirectedRef.current = true;
      submitGuardRef.current = false;
      dispatchStep({ type: 'CREATE_SUCCESS' });
      logBookingFlowStep('REDIRECT_PAYMENT', {
        bookingId: state.bookingId,
        bookingCode: state.bookingCode,
        nextRoute: state.nextRoute,
      });
      router.replace(state.nextRoute);
    }
  }, [state, router]);

  useEffect(() => {
    if (step !== 'CREATE_BOOKING' || !isPending) return;

    const timer = window.setTimeout(() => {
      if (!submitGuardRef.current) return;
      submitGuardRef.current = false;
      dispatchStep({ type: 'CREATE_TIMEOUT' });
      setClientError(BOOKING_CREATE_TIMEOUT_MESSAGE);
      logBookingFlowStep('FAILED', { reason: 'client_timeout' });
    }, BOOKING_CREATE_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [step, isPending]);

  function handleContinue() {
    if (step === 'FAILED') {
      handleRetry();
      if (!isLoggedIn) return;
      dispatchStep({ type: 'CONTINUE_SIGNED_IN' });
      submitCreateBooking();
      return;
    }
    if (!isLoggedIn) {
      dispatchStep({ type: 'CONTINUE_GUEST' });
      logBookingFlowStep('AUTH_REQUIRED');
      return;
    }
    dispatchStep({ type: 'CONTINUE_SIGNED_IN' });
    submitCreateBooking();
  }

  function handleRetry() {
    redirectedRef.current = false;
    dispatchStep({ type: 'RESET' });
    setClientError(null);
    submitGuardRef.current = false;
  }

  const busy = isBookingFlowBusy(step, isPending);
  const errorMessage = clientError ?? (state.status === 'error' ? state.message : null);
  const showContinue = step !== 'AUTH_REQUIRED' || isLoggedIn;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <BookingReviewCard data={review} />

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
              }}
              className="text-xs font-semibold text-rose-100 underline"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      <form ref={formRef} action={formAction} className="space-y-3">
        <input type="hidden" name="startDate" value={startDate} />
        {endDate ? <input type="hidden" name="endDate" value={endDate} /> : null}
        <input type="hidden" name="durationMode" value={durationMode} />
        <input type="hidden" name="stayType" value={stayType} />
        {bedIds.map((id) => (
          <input key={id} type="hidden" name="bedId" value={id} />
        ))}

        {showContinue ? (
          <button
            type="button"
            disabled={busy}
            onClick={handleContinue}
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
