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
import { withBookingActionTimeout } from '@/src/lib/booking/bookingActionTimeout';
import { getCustomerById, isProfileComplete } from '@/src/services/profile';
import { trackAnalyticsEvent } from '@/src/services/visitorAnalytics';
import { logger } from '@/src/lib/logger';

/**
 * Single mutating entry point for customer booking confirmation.
 * Success always includes bookingId + nextRoute — the client only navigates.
 */

export type BookingActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string; conflictBedIds?: string[] }
  | {
      status: 'success';
      bookingId: string;
      bookingCode: string;
      nextRoute: string;
      /** @deprecated Use nextRoute */
      redirectTo: string;
    };

const VALID_MODES: ReadonlySet<PricingMode> = new Set([
  'open_ended',
  'fixed_stay',
  'monthly',
  'daily',
  'weekly',
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

function nextRouteForBooking(status: 'pending_payment' | 'confirmed', bookingCode: string): string {
  return status === 'pending_payment'
    ? `/booking/${bookingCode}/pay`
    : `/booking/${bookingCode}`;
}

export async function createBookingAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const startedAt = Date.now();
  logger.info('[booking-flow] CREATE_BOOKING start');

  const session = await getCustomerSession();
  if (!session) {
    logger.warn('[booking-flow] CREATE_BOOKING failure', { reason: 'no_session' });
    return { status: 'error', message: 'Sign in required to complete a booking.' };
  }

  const customer = await getCustomerById(session.customerId);
  if (!customer || !isProfileComplete(customer)) {
    logger.warn('[booking-flow] CREATE_BOOKING failure', { reason: 'incomplete_profile' });
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
    const quote = await withBookingActionTimeout(
      quoteBookingPrice({
        bedIds,
        startDate: funnelDates.start,
        endDate: funnelDates.end,
        durationMode,
        includeDeposit: true,
      }),
    );
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
    const message =
      err instanceof Error ? err.message : 'Could not verify pricing for these dates.';
    logger.warn('[booking-flow] CREATE_BOOKING failure', { reason: 'quote', message });
    return { status: 'error', message };
  }

  const fullName = customer.fullName.trim();
  const email = customer.email;
  const phone = customer.phone;
  const gender = customer.gender;

  let result;
  try {
    result = await withBookingActionTimeout(
      createBooking({
        bedIds,
        startDate: funnelDates.start,
        endDate: funnelDates.end,
        durationMode,
        customerId: session.customerId,
        customer: {
          fullName,
          email,
          phone,
          gender,
        },
        notes: notes || undefined,
        couponCode: couponCode || undefined,
      }),
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Something went wrong creating your booking.';
    logger.error('[booking-flow] CREATE_BOOKING failure', {
      reason: 'timeout_or_throw',
      message,
      elapsedMs: Date.now() - startedAt,
    });
    return { status: 'error', message };
  }

  if (!result.ok) {
    logger.warn('[booking-flow] CREATE_BOOKING failure', {
      reason: result.kind,
      message: result.message,
      elapsedMs: Date.now() - startedAt,
    });
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

  revalidatePath('/admin');
  revalidatePath('/admin/bookings');
  revalidatePath('/admin/residents');

  const nextRoute = nextRouteForBooking(result.status, result.bookingCode);
  logger.info('[booking-flow] CREATE_BOOKING success', {
    bookingId: result.bookingId,
    bookingCode: result.bookingCode,
    nextRoute,
    elapsedMs: Date.now() - startedAt,
  });

  return {
    status: 'success',
    bookingId: result.bookingId,
    bookingCode: result.bookingCode,
    nextRoute,
    redirectTo: nextRoute,
  };
}
