'use server';

import { revalidatePath } from 'next/cache';
import { createBooking } from '@/src/services/booking';
import type { PricingMode } from '@/src/services/pricing';
import {
  stayTypeFromPricingMode,
  type StayType,
} from '@/src/lib/stayType';
import {
  bookingFunnelDatesFromParams,
  validateBookingFunnelDates,
} from '@/src/lib/booking/bookingFunnelDates';
import { quoteBookingPrice } from '@/src/services/pricing';
import { createPendingMembershipForBooking } from '@/src/services/playstationMembership';
import { isPs4PlanId } from '@/src/lib/playstation/plans';
import { getCustomerSession } from '@/src/lib/auth/session';
import { indianPhonesEqual, normaliseIndianPhone } from '@/src/lib/phone';
import { getCustomerById, isProfileComplete } from '@/src/services/profile';
import { trackAnalyticsEvent } from '@/src/services/visitorAnalytics';

/**
 * The single mutating entry point for the customer cart.
 *
 * We pair the action with `useActionState` on the client so submission
 * pending state and error rendering can stay declarative. On success we
 * On success we return `{ status: 'success', redirectTo }` for client navigation.
 */

export type BookingActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string; conflictBedIds?: string[] }
  | { status: 'success'; redirectTo: string };

const VALID_MODES: ReadonlySet<PricingMode> = new Set([
  'open_ended',
  'fixed_stay',
  'monthly',
  'daily',
  'weekly',
]);
const VALID_GENDERS = new Set(['male', 'female', 'other']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getString(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

function getAll(form: FormData, key: string): string[] {
  return form
    .getAll(key)
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export async function createBookingAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const session = await getCustomerSession();
  if (!session) {
    return { status: 'error', message: 'Sign in required to complete a booking.' };
  }

  const customer = await getCustomerById(session.customerId);
  if (!customer || !isProfileComplete(customer)) {
    return {
      status: 'error',
      message: 'Complete your resident profile (name, email, mobile) before booking.',
    };
  }

  const bedIds = getAll(formData, 'bedId');
  const startDate = getString(formData, 'startDate');
  const endDateRaw = getString(formData, 'endDate');
  const durationModeRaw = getString(formData, 'durationMode') as PricingMode;
  const stayTypeRaw = getString(formData, 'stayType');
  let durationMode = durationModeRaw;
  if (stayTypeRaw === 'monthly_stay') durationMode = 'open_ended';
  if (stayTypeRaw === 'fixed_date_stay') durationMode = 'fixed_stay';
  if (durationMode === 'daily' || durationMode === 'weekly') durationMode = 'fixed_stay';
  const fullName = getString(formData, 'fullName');
  const email = getString(formData, 'email');
  const phone = getString(formData, 'phone');
  const genderRaw = getString(formData, 'gender');
  const gender =
    VALID_GENDERS.has(genderRaw) ? (genderRaw as 'male' | 'female' | 'other') : customer.gender;
  const notes = getString(formData, 'notes');
  const ps4PlanRaw = getString(formData, 'ps4Plan');
  const couponCode = getString(formData, 'couponCode');

  if (bedIds.length === 0 || bedIds.some((id) => !UUID_RE.test(id))) {
    return {
      status: 'error',
      message: 'Pick at least one bed before confirming.',
    };
  }
  if (!ISO_DATE_RE.test(startDate)) {
    return { status: 'error', message: 'Check-in date is missing or invalid.' };
  }
  if (!VALID_MODES.has(durationModeRaw) && !['monthly_stay', 'fixed_date_stay'].includes(stayTypeRaw)) {
    return { status: 'error', message: 'Pick a stay type.' };
  }
  const endDate = durationMode === 'open_ended' ? null : endDateRaw || null;
  if (durationMode !== 'open_ended' && (!endDateRaw || !ISO_DATE_RE.test(endDateRaw))) {
    return { status: 'error', message: 'Check-out date is missing or invalid.' };
  }

  const bookingStayType: StayType =
    stayTypeRaw === 'monthly_stay' || stayTypeRaw === 'fixed_date_stay'
      ? stayTypeRaw
      : stayTypeFromPricingMode(durationMode);
  const funnelDates = bookingFunnelDatesFromParams({
    start: startDate,
    end: endDate,
    stayType: bookingStayType,
  });
  const funnelDateError = validateBookingFunnelDates(funnelDates);
  if (funnelDateError) {
    return { status: 'error', message: funnelDateError };
  }

  try {
    const quote = await quoteBookingPrice({
      bedIds,
      startDate: funnelDates.start,
      endDate: funnelDates.end,
      durationMode,
      includeDeposit: true,
    });
    if (durationMode === 'fixed_stay') {
      const quoteNights = quote.perBed[0]?.nights ?? null;
      if (quoteNights !== funnelDates.stayNights) {
        return {
          status: 'error',
          message: 'Stay dates changed during checkout. Go back and pick your dates again.',
        };
      }
    }
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not verify pricing for these dates.',
    };
  }

  if (!fullName || fullName.length < 2) {
    return { status: 'error', message: 'Enter your full name.' };
  }
  if (!EMAIL_RE.test(email)) {
    return { status: 'error', message: 'Enter a valid email address.' };
  }
  const normalisedPhone = normaliseIndianPhone(phone);
  if (!normalisedPhone || !indianPhonesEqual(normalisedPhone, session.phone)) {
    return {
      status: 'error',
      message: 'Mobile number must match your signed-in account.',
    };
  }
  if (!VALID_GENDERS.has(gender)) {
    return {
      status: 'error',
      message: 'Complete your profile gender in account settings before booking.',
    };
  }

  const result = await createBooking({
    bedIds,
    startDate: funnelDates.start,
    endDate: funnelDates.end,
    durationMode,
    customerId: session.customerId,
    customer: {
      fullName,
      email,
      phone: normalisedPhone,
      gender: gender as 'male' | 'female' | 'other',
    },
    notes: notes || undefined,
    couponCode: couponCode || undefined,
  });

  if (!result.ok) {
    return {
      status: 'error',
      message: result.message,
      conflictBedIds: result.conflictBedIds,
    };
  }

  void trackAnalyticsEvent({
    eventType: 'booking_started',
    metadata: { bedCount: bedIds.length, durationMode, couponApplied: Boolean(couponCode) },
  });

  if (couponCode) {
    void trackAnalyticsEvent({
      eventType: 'coupon_applied',
      metadata: { bookingId: result.bookingId, couponCode: couponCode.trim() },
    });
  }

  if (ps4PlanRaw && isPs4PlanId(ps4PlanRaw)) {
    const { getBedsForCart } = await import('@/src/db/queries/customer');
    const cartBeds = await getBedsForCart(bedIds);
    if (cartBeds.ok && cartBeds.data.length > 0) {
      await createPendingMembershipForBooking({
        customerId: session.customerId,
        pgId: cartBeds.data[0]!.pgId,
        bookingId: result.bookingId,
        plan: ps4PlanRaw,
      });
    }
  }

  // Bust the admin dashboard cache so the new reservation shows up there.
  revalidatePath('/admin');
  revalidatePath('/admin/bookings');
  revalidatePath('/admin/residents');

  // Phase 4: customer-initiated bookings come back as `pending_payment` with
  // a `hold` reservation. Send them to the pay page; on payment success the
  // webhook flips state and the pay page itself redirects to /booking/[code].
  // Admin-initiated bookings (status='confirmed') skip straight to the
  // confirmation page since money is handled out-of-band.
  if (result.status === 'pending_payment') {
    return { status: 'success', redirectTo: `/booking/${result.bookingCode}/pay` };
  }
  return { status: 'success', redirectTo: `/booking/${result.bookingCode}` };
}
