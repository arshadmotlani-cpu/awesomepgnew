/** Canonical Deposit Express deep links. */
export function depositExpressHref(bookingId?: string | null, customerId?: string | null): string {
  const params = new URLSearchParams();
  if (bookingId) params.set('booking', bookingId);
  if (customerId) params.set('customer', customerId);
  const q = params.toString();
  return q ? `/admin/deposit-express?${q}` : '/admin/deposit-express';
}

export const DEPOSIT_EXPRESS_RETURN_PATH = '/admin/deposit-express';
