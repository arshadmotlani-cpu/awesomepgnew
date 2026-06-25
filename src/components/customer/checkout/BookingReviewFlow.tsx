'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookingReviewCard, type BookingReviewData } from './BookingReviewCard';
import { BookingInlineAuth } from './BookingInlineAuth';
import {
  createBookingAction,
  type BookingActionState,
} from '@/app/(customer)/booking/new/actions';
import type { StayType } from '@/src/lib/stayType';

type Phase = 'review' | 'auth' | 'submitting';

const INITIAL_STATE: BookingActionState = { status: 'idle' };
const RESUME_KEY = 'apg-booking-review-continue';

type Props = {
  isLoggedIn: boolean;
  review: BookingReviewData;
  bedIds: string[];
  startDate: string;
  endDate: string | null;
  stayType: StayType;
  durationMode: 'daily' | 'weekly' | 'monthly' | 'open_ended' | 'fixed_stay';
  defaultCustomer?: {
    fullName: string;
    email: string;
    phone: string;
  };
};

export function BookingReviewFlow({
  isLoggedIn,
  review,
  bedIds,
  startDate,
  endDate,
  stayType,
  durationMode,
  defaultCustomer,
}: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('review');
  const resumeAfterAuthRef = useRef(
    typeof window !== 'undefined' && sessionStorage.getItem(RESUME_KEY) === '1',
  );
  const [state, formAction, isPending] = useActionState(createBookingAction, INITIAL_STATE);

  useEffect(() => {
    if (state.status === 'success' && state.redirectTo) {
      router.refresh();
      router.push(state.redirectTo);
    }
  }, [state, router]);

  useEffect(() => {
    if (!isLoggedIn || !resumeAfterAuthRef.current) return;
    resumeAfterAuthRef.current = false;
    sessionStorage.removeItem(RESUME_KEY);
    setPhase('submitting');
    const form = document.getElementById('booking-review-submit') as HTMLFormElement | null;
    form?.requestSubmit();
  }, [isLoggedIn]);

  function handleContinue() {
    if (!isLoggedIn) {
      resumeAfterAuthRef.current = true;
      sessionStorage.setItem(RESUME_KEY, '1');
      setPhase('auth');
      return;
    }
    setPhase('submitting');
  }

  const busy = phase === 'submitting' || isPending;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <BookingReviewCard data={review} />

      {phase === 'auth' && !isLoggedIn ? (
        <BookingInlineAuth
          onAuthenticated={() => {
            router.refresh();
          }}
        />
      ) : null}

      {state.status === 'error' ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {state.message}
        </div>
      ) : null}

      <form id="booking-review-submit" action={formAction} className="space-y-3">
        <input type="hidden" name="startDate" value={startDate} />
        {endDate ? <input type="hidden" name="endDate" value={endDate} /> : null}
        <input type="hidden" name="durationMode" value={durationMode} />
        <input type="hidden" name="stayType" value={stayType} />
        {bedIds.map((id) => (
          <input key={id} type="hidden" name="bedId" value={id} />
        ))}
        {defaultCustomer ? (
          <>
            <input type="hidden" name="fullName" value={defaultCustomer.fullName} />
            <input type="hidden" name="email" value={defaultCustomer.email} />
            <input type="hidden" name="phone" value={defaultCustomer.phone} />
          </>
        ) : (
          <>
            <input type="hidden" name="fullName" value="" />
            <input type="hidden" name="email" value="" />
            <input type="hidden" name="phone" value="" />
          </>
        )}

        {phase !== 'auth' || isLoggedIn ? (
          <button
            type="submit"
            disabled={busy}
            onClick={(e) => {
              if (!isLoggedIn) {
                e.preventDefault();
                handleContinue();
              } else if (phase === 'review') {
                setPhase('submitting');
              }
            }}
            className="flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-apg-orange text-base font-bold text-white shadow-[0_0_32px_rgba(255,90,31,0.35)] transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'Confirming your booking…' : 'Continue'}
          </button>
        ) : null}
      </form>

      {isLoggedIn && defaultCustomer ? (
        <p className="text-center text-xs text-apg-silver">
          Signed in as {defaultCustomer.fullName}. Continue goes straight to payment.
        </p>
      ) : phase === 'review' ? (
        <p className="text-center text-xs text-apg-silver">
          You&apos;ll sign in only if needed — your choices stay saved.
        </p>
      ) : null}
    </div>
  );
}
