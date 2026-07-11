/**
 * Booking Approval queue SSOT — pending admin work only.
 *
 * Active/confirmed bed reserves are post-approval inventory state and must never
 * appear in Operations → Booking Approval (or inflate its badge).
 */

export function isEligibleForBookingApprovalQueue(bookingStatus: string): boolean {
  return bookingStatus === 'pending_approval';
}

/** Admin booking detail — never the public customer `/booking/:code` route. */
export function bookingApprovalOpenHref(bookingId: string): string {
  return `/admin/bookings/${bookingId}`;
}

export type LegacyBookingApprovalRow = {
  id: string;
  bookingCode: string | null;
  customerName: string;
  pgName: string;
};

export function mapLegacyBookingApprovalToOpsItem(b: LegacyBookingApprovalRow) {
  return {
    id: `booking-${b.id}`,
    queue: 'booking_approval' as const,
    residentName: b.customerName,
    pgName: b.pgName,
    roomNumber: null,
    bedCode: null,
    reason: 'Booking pending admin approval (legacy — no payment proof)',
    openHref: bookingApprovalOpenHref(b.id),
    openLabel: 'Review booking',
    bookingId: b.id,
    bookingCode: b.bookingCode,
    statusLabel: 'Pending approval',
  };
}
