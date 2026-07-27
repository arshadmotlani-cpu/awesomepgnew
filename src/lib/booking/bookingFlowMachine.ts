/**
 * Customer booking funnel — explicit steps for logging and UI state.
 * Every transition should call `logBookingFlowStep`.
 */

export const BOOKING_FLOW_STEPS = [
  'IDLE',
  'SELECT_STAY_TYPE',
  'SELECT_DATES',
  'REVIEW',
  'AUTH_REQUIRED',
  'CREATE_BOOKING',
  'BOOKING_CREATED',
  'REDIRECT_PAYMENT',
  'PAYMENT_SCREEN',
  'FAILED',
] as const;

export type BookingFlowStep = (typeof BOOKING_FLOW_STEPS)[number];

export type BookingFlowEvent =
  | { type: 'OPEN_REVIEW' }
  | { type: 'CONTINUE_GUEST' }
  | { type: 'CONTINUE_SIGNED_IN' }
  | { type: 'AUTH_COMPLETE' }
  | { type: 'CREATE_START' }
  | { type: 'CREATE_SUCCESS' }
  | { type: 'CREATE_ERROR' }
  | { type: 'CREATE_TIMEOUT' }
  | { type: 'RESET' };

export function bookingFlowReducer(
  step: BookingFlowStep,
  event: BookingFlowEvent,
): BookingFlowStep {
  switch (event.type) {
    case 'OPEN_REVIEW':
      return 'REVIEW';
    case 'CONTINUE_GUEST':
      return step === 'REVIEW' ? 'AUTH_REQUIRED' : step;
    case 'CONTINUE_SIGNED_IN':
      return step === 'REVIEW' ? 'CREATE_BOOKING' : step;
    case 'AUTH_COMPLETE':
      return step === 'AUTH_REQUIRED' ? 'CREATE_BOOKING' : step;
    case 'CREATE_START':
      return 'CREATE_BOOKING';
    case 'CREATE_SUCCESS':
      return 'BOOKING_CREATED';
    case 'CREATE_ERROR':
    case 'CREATE_TIMEOUT':
      return 'FAILED';
    case 'RESET':
      return 'REVIEW';
    default:
      return step;
  }
}

export function isBookingFlowBusy(step: BookingFlowStep, actionPending: boolean): boolean {
  return step === 'CREATE_BOOKING' && actionPending;
}

/**
 * Continue died silently when submitGuard stayed true, step stayed CREATE_BOOKING,
 * and useActionState never flipped isPending — the old watchdog required isPending.
 */
export function isStuckCreateSubmit(input: {
  step: BookingFlowStep;
  submitGuard: boolean;
  actionPending: boolean;
  actionStatus: 'idle' | 'error' | 'success';
}): boolean {
  return (
    input.step === 'CREATE_BOOKING' &&
    input.submitGuard &&
    !input.actionPending &&
    input.actionStatus === 'idle'
  );
}

/** True when Continue should reset + retry instead of silently no-op. */
export function shouldRecoverStuckContinue(input: {
  step: BookingFlowStep;
  submitGuard: boolean;
}): boolean {
  return input.submitGuard && input.step !== 'REVIEW' && input.step !== 'FAILED';
}

export function logBookingFlowStep(
  step: BookingFlowStep,
  detail?: Record<string, unknown>,
): void {
  const payload = { step, at: new Date().toISOString(), ...detail };
  if (typeof window !== 'undefined') {
    console.info('[booking-flow]', payload);
  }
}

/** Full create action hung while pending. */
export const BOOKING_CREATE_TIMEOUT_MS = 10_000;

/**
 * Create submit started but action never became pending (requestSubmit no-op / broken
 * useActionState). Must be shorter than BOOKING_CREATE_TIMEOUT_MS and must NOT require
 * isPending — that was the silent Continue regression.
 */
export const BOOKING_CREATE_PENDING_START_MS = 2_500;

export const BOOKING_CREATE_TIMEOUT_MESSAGE =
  'Something went wrong creating your booking. Please try again.';
