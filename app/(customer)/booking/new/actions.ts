'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createBooking } from '@/src/services/booking';
import type { PricingMode } from '@/src/services/pricing';
import { createPendingMembershipForBooking } from '@/src/services/playstationMembership';
import { isPs4PlanId } from '@/src/lib/playstation/plans';
import { getCustomerSession } from '@/src/lib/auth/session';
import { indianPhonesEqual, normaliseIndianPhone } from '@/src/lib/phone';
import { getCustomerById, isProfileComplete } from '@/src/services/profile';

/**
 * The single mutating entry point for the customer cart.
 *
 * We pair the action with `useActionState` on the client so submission
 * pending state and error rendering can stay declarative. On success we
 * call `redirect()` from `next/navigation`, which throws a framework-handled
 * exception; the action therefore never returns a "success" state object —
 * callers only ever see `idle | error`.
 */

export type BookingActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string; conflictBedIds?: string[] };

const VALID_MODES: ReadonlySet<PricingMode> = new Set([
  'daily',
  'weekly',
  'monthly',
  'open_ended',
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
  const durationMode = getString(formData, 'durationMode') as PricingMode;
  const fullName = getString(formData, 'fullName');
  const email = getString(formData, 'email');
  const phone = getString(formData, 'phone');
  const gender = getString(formData, 'gender');
  const notes = getString(formData, 'notes');
  const ps4PlanRaw = getString(formData, 'ps4Plan');

  if (bedIds.length === 0 || bedIds.some((id) => !UUID_RE.test(id))) {
    return {
      status: 'error',
      message: 'Pick at least one bed before confirming.',
    };
  }
  if (!ISO_DATE_RE.test(startDate)) {
    return { status: 'error', message: 'Check-in date is missing or invalid.' };
  }
  if (!VALID_MODES.has(durationMode)) {
    return { status: 'error', message: 'Pick a stay type.' };
  }
  const endDate = durationMode === 'open_ended' ? null : endDateRaw;
  if (durationMode !== 'open_ended' && !ISO_DATE_RE.test(endDateRaw)) {
    return { status: 'error', message: 'Check-out date is missing or invalid.' };
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
    return { status: 'error', message: 'Pick a gender for PG eligibility checks.' };
  }

  const result = await createBooking({
    bedIds,
    startDate,
    endDate,
    durationMode,
    customerId: session.customerId,
    customer: {
      fullName,
      email,
      phone: normalisedPhone,
      gender: gender as 'male' | 'female' | 'other',
    },
    notes: notes || undefined,
  });

  if (!result.ok) {
    return {
      status: 'error',
      message: result.message,
      conflictBedIds: result.conflictBedIds,
    };
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
    redirect(`/booking/${result.bookingCode}/pay`);
  }
  redirect(`/booking/${result.bookingCode}`);
}
