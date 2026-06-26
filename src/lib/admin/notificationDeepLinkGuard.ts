/**
 * Validates notification ?read= deep links — never throws.
 * Returns "resolved" when the linked action no longer needs admin attention.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bookings,
  checkoutSettlements,
  customers,
  kycSubmissions,
  residentRequests,
  vacatingRequests,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';

export type NotificationDeepLinkStatus = 'none' | 'active' | 'resolved';

export type NotificationDeepLinkResult = {
  status: NotificationDeepLinkStatus;
  message: string;
};

const RESOLVED_MESSAGE = 'This action has already been completed.';

export function parseNotificationReadKey(readParam: string | undefined): string | null {
  if (!readParam?.trim()) return null;
  try {
    return decodeURIComponent(readParam.trim());
  } catch {
    return readParam.trim();
  }
}

export async function evaluateNotificationDeepLink(
  readParam: string | undefined,
): Promise<NotificationDeepLinkResult> {
  const readKey = parseNotificationReadKey(readParam);
  if (!readKey) return { status: 'none', message: '' };

  if (readKey.startsWith('vacating:')) {
    return evaluateVacatingRead(readKey.slice('vacating:'.length));
  }

  if (readKey.startsWith('kyc:')) {
    return evaluateKycRead(readKey.slice('kyc:'.length));
  }

  if (readKey.startsWith('deposit:')) {
    return evaluateBookingRead(readKey.slice('deposit:'.length));
  }

  if (readKey.startsWith('refund:')) {
    return evaluateBookingRead(readKey.slice('refund:'.length));
  }

  if (readKey.startsWith('request:')) {
    return evaluateRequestRead(readKey.slice('request:'.length));
  }

  if (readKey.startsWith('resident:')) {
    const parts = readKey.slice('resident:'.length).split(':');
    return evaluateResidentRead(parts[0] ?? '');
  }

  return { status: 'none', message: '' };
}

async function evaluateVacatingRead(vacatingRequestId: string): Promise<NotificationDeepLinkResult> {
  if (!vacatingRequestId) {
    return { status: 'resolved', message: RESOLVED_MESSAGE };
  }

  const [row] = await db
    .select({ status: vacatingRequests.status })
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, vacatingRequestId))
    .limit(1);

  if (!row) {
    return { status: 'resolved', message: RESOLVED_MESSAGE };
  }

  if (row.status === 'completed' || row.status === 'rejected') {
    return { status: 'resolved', message: RESOLVED_MESSAGE };
  }

  return { status: 'active', message: '' };
}

async function evaluateKycRead(submissionId: string): Promise<NotificationDeepLinkResult> {
  if (!submissionId) {
    return { status: 'resolved', message: RESOLVED_MESSAGE };
  }

  const [row] = await db
    .select({ status: kycSubmissions.status })
    .from(kycSubmissions)
    .where(eq(kycSubmissions.id, submissionId))
    .limit(1);

  if (!row) {
    return { status: 'resolved', message: RESOLVED_MESSAGE };
  }

  if (row.status !== 'pending') {
    return { status: 'resolved', message: RESOLVED_MESSAGE };
  }

  return { status: 'active', message: '' };
}

async function evaluateRequestRead(requestId: string): Promise<NotificationDeepLinkResult> {
  if (!requestId) {
    return { status: 'resolved', message: RESOLVED_MESSAGE };
  }

  const [row] = await db
    .select({ status: residentRequests.status })
    .from(residentRequests)
    .where(eq(residentRequests.id, requestId))
    .limit(1);

  if (!row) {
    return { status: 'resolved', message: RESOLVED_MESSAGE };
  }

  if (!['submitted', 'under_review', 'approved'].includes(row.status)) {
    return { status: 'resolved', message: RESOLVED_MESSAGE };
  }

  return { status: 'active', message: '' };
}

async function evaluateResidentRead(customerId: string): Promise<NotificationDeepLinkResult> {
  if (!customerId) {
    return { status: 'resolved', message: RESOLVED_MESSAGE };
  }

  const [row] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!row) {
    return { status: 'resolved', message: RESOLVED_MESSAGE };
  }

  return { status: 'active', message: '' };
}

export async function evaluateBookingDetailDeepLink(
  bookingId: string,
): Promise<NotificationDeepLinkResult> {
  return evaluateBookingRead(bookingId);
}

export async function evaluatePaymentProofDeepLink(
  session: AdminSession,
  bookingId: string,
): Promise<NotificationDeepLinkResult> {
  const bookingResult = await evaluateBookingRead(bookingId);
  if (bookingResult.status === 'resolved') return bookingResult;

  const pending = await listPendingPaymentReviews(session);
  const stillPending = pending.some((item) => item.bookingId === bookingId);
  if (!stillPending) {
    return { status: 'resolved', message: RESOLVED_MESSAGE };
  }

  return { status: 'active', message: '' };
}

async function evaluateBookingRead(bookingId: string): Promise<NotificationDeepLinkResult> {
  if (!bookingId) {
    return { status: 'resolved', message: RESOLVED_MESSAGE };
  }

  const [row] = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!row) {
    return { status: 'resolved', message: RESOLVED_MESSAGE };
  }

  if (row.status === 'cancelled') {
    return { status: 'resolved', message: RESOLVED_MESSAGE };
  }

  return { status: 'active', message: '' };
}

export async function evaluateCheckoutSettlementDeepLink(
  settlementId: string,
  readParam?: string,
): Promise<NotificationDeepLinkResult> {
  const fromRead = await evaluateNotificationDeepLink(readParam);
  if (fromRead.status === 'resolved') return fromRead;

  const [row] = await db
    .select({ status: checkoutSettlements.status })
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.id, settlementId))
    .limit(1);

  if (!row) {
    return { status: 'resolved', message: RESOLVED_MESSAGE };
  }

  if (row.status === 'completed' || row.status === 'refund_paid') {
    return { status: 'resolved', message: RESOLVED_MESSAGE };
  }

  return { status: 'active', message: '' };
}

export { RESOLVED_MESSAGE };
