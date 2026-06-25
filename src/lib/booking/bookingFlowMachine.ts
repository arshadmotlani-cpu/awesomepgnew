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

export function logBookingFlowStep(
  step: BookingFlowStep,
  detail?: Record<string, unknown>,
): void {
  const payload = { step, at: new Date().toISOString(), ...detail };
  if (typeof window !== 'undefined') {
    console.info('[booking-flow]', payload);
  }
}

export const BOOKING_CREATE_TIMEOUT_MS = 10_000;

export const BOOKING_CREATE_TIMEOUT_MESSAGE =
  'Something went wrong creating your booking. Please try again.';
