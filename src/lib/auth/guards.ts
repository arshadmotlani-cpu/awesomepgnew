import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings } from '@/src/db/schema';
import {
  getAdminSession,
  getCustomerSession,
  type AdminSession,
  type CustomerSession,
} from './session';
import { adminHasPermission, type AdminPermission } from './roles';

export async function requireCustomerSession(next?: string): Promise<CustomerSession> {
  const session = await getCustomerSession();
  if (!session) {
    const dest = next ? `/login?next=${encodeURIComponent(next)}` : '/login';
    redirect(dest);
  }
  return session;
}

type RequireAdminSessionOpts = {
  /** Allow access while `mustChangePassword` is set (change-password page only). */
  allowPasswordChange?: boolean;
};

export async function requireAdminSession(
  next?: string,
  opts?: RequireAdminSessionOpts,
): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    const dest = next ? `/admin/login?next=${encodeURIComponent(next)}` : '/admin/login';
    redirect(dest);
  }
  if (session.mustChangePassword && !opts?.allowPasswordChange) {
    const q = next ? `?next=${encodeURIComponent(next)}` : '';
    redirect(`/admin/change-password${q}`);
  }
  return session;
}

export async function requireAdminPermission(
  permission: AdminPermission,
): Promise<AdminSession> {
  const session = await requireAdminSession();
  if (!adminHasPermission(session.role, permission)) {
    throw new Error('You do not have permission to perform this action.');
  }
  return session;
}

/** Ensure the logged-in customer owns the booking. */
export async function requireCustomerOwnsBooking(
  session: CustomerSession,
  bookingId: string,
): Promise<{ bookingId: string; bookingCode: string; customerId: string }> {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row || row.customerId !== session.customerId) {
    throw new Error('Booking not found or access denied.');
  }
  return row;
}

export async function requireCustomerOwnsBookingCode(
  session: CustomerSession,
  bookingCode: string,
): Promise<{ bookingId: string; bookingCode: string; customerId: string }> {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
    })
    .from(bookings)
    .where(eq(bookings.bookingCode, bookingCode))
    .limit(1);
  if (!row || row.customerId !== session.customerId) {
    throw new Error('Booking not found or access denied.');
  }
  return row;
}
