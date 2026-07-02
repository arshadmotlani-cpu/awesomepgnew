/** Canonical Refund Console deep links — sole admin refund workflow. */

export function refundConsoleHref(bookingId: string): string {
  return `/admin/refunds?booking=${encodeURIComponent(bookingId)}`;
}

export function refundConsoleSearchHref(query: string): string {
  return `/admin/refunds?q=${encodeURIComponent(query.trim())}`;
}
