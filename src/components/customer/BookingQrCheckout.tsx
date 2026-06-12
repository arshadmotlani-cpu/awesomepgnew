'use client';

import { BookingCheckoutExperience, type BookingCheckoutExperienceProps } from './checkout/BookingCheckoutExperience';

/** @deprecated Prefer BookingCheckoutExperience — thin alias for existing imports. */
export function BookingQrCheckout(props: BookingCheckoutExperienceProps) {
  return <BookingCheckoutExperience {...props} />;
}
