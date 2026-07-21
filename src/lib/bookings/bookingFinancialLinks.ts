/** Canonical admin financial workspace for a booking. */
export function bookingFinancialWorkspaceHref(bookingId: string): string {
  return `/admin/bookings/${bookingId}/financial`;
}

export function bookingFinancialWorkspaceSectionHref(
  bookingId: string,
  section: string,
): string {
  return `${bookingFinancialWorkspaceHref(bookingId)}#${section}`;
}
