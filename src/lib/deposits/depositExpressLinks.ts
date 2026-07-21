import { bookingFinancialWorkspaceHref } from '@/src/lib/bookings/bookingFinancialLinks';

/** Canonical deposit collection deep link — routes to booking financial workspace. */
export function depositExpressHref(bookingId?: string | null, customerId?: string | null): string {
  if (bookingId) return bookingFinancialWorkspaceHref(bookingId);
  const params = new URLSearchParams();
  if (customerId) params.set('customer', customerId);
  const q = params.toString();
  return q ? `/admin/deposit-express?${q}` : '/admin/deposit-express';
}

export const DEPOSIT_EXPRESS_RETURN_PATH = '/admin/deposit-express';
