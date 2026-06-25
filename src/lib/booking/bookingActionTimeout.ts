import {
  BOOKING_CREATE_TIMEOUT_MESSAGE,
  BOOKING_CREATE_TIMEOUT_MS,
} from '@/src/lib/booking/bookingFlowMachine';

export class BookingActionTimeoutError extends Error {
  constructor(message = BOOKING_CREATE_TIMEOUT_MESSAGE) {
    super(message);
    this.name = 'BookingActionTimeoutError';
  }
}

/** Server-side guard — never let createBooking hang the action indefinitely. */
export async function withBookingActionTimeout<T>(
  work: Promise<T>,
  ms = BOOKING_CREATE_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new BookingActionTimeoutError()),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
