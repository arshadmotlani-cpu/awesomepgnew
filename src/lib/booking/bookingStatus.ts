/**
 * Booking status SSOT — presentation, partitioning, and lifecycle classification.
 * Operational gates remain on positive allowlists (confirmed, pending_*, etc.).
 */
import { bookingStatusEnum, type BookingStatus } from '@/src/db/schema/enums';
import {
  isOpenBookingLifecycleStatus,
  isSupersededBookingStatus,
  isTerminalBookingLifecycleStatus,
  OPEN_BOOKING_LIFECYCLE_STATUSES,
} from '@/src/lib/booking/supersededBookingLifecycle';

export type { BookingStatus };
export {
  isOpenBookingLifecycleStatus,
  isSupersededBookingStatus,
  isTerminalBookingLifecycleStatus,
  OPEN_BOOKING_LIFECYCLE_STATUSES,
};

export const BOOKING_STATUSES = bookingStatusEnum.enumValues;

/** Historical / terminal bookings shown under Closed in My Bookings. */
export const CLOSED_BOOKING_STATUSES = [
  'superseded',
  'cancelled',
  'completed',
  'refunded',
] as const satisfies readonly BookingStatus[];

export type ClosedBookingStatus = (typeof CLOSED_BOOKING_STATUSES)[number];

export function isBookingStatus(value: string): value is BookingStatus {
  return (BOOKING_STATUSES as readonly string[]).includes(value);
}

export function isClosedBookingStatus(status: string): status is ClosedBookingStatus {
  return (CLOSED_BOOKING_STATUSES as readonly string[]).includes(status);
}

/** Bookings that may still need resident action (pay, approval, active stay). */
export function isOpenMyBookingsStatus(status: string): boolean {
  return isBookingStatus(status) && !isClosedBookingStatus(status);
}

export function labelBookingStatus(status: BookingStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'pending_payment':
      return 'Pending payment';
    case 'pending_approval':
      return 'Awaiting approval';
    case 'confirmed':
      return 'Confirmed';
    case 'superseded':
      return 'Superseded';
    case 'cancelled':
      return 'Cancelled';
    case 'completed':
      return 'Completed';
    case 'refunded':
      return 'Refunded';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export type CustomerBookingStatusTone = {
  bg: string;
  text: string;
  ring: string;
  label: string;
};

const CUSTOMER_BOOKING_STATUS_TONES: Record<BookingStatus, CustomerBookingStatusTone> = {
  confirmed: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    ring: 'ring-emerald-200',
    label: 'Confirmed',
  },
  pending_payment: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    ring: 'ring-amber-200',
    label: 'Pending payment',
  },
  pending_approval: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    ring: 'ring-amber-200',
    label: 'Awaiting approval',
  },
  draft: {
    bg: 'bg-zinc-100',
    text: 'text-zinc-700',
    ring: 'ring-zinc-200',
    label: 'Draft',
  },
  superseded: {
    bg: 'bg-violet-50',
    text: 'text-violet-800',
    ring: 'ring-violet-200',
    label: 'Superseded',
  },
  cancelled: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    ring: 'ring-rose-200',
    label: 'Cancelled',
  },
  completed: {
    bg: 'bg-zinc-100',
    text: 'text-zinc-700',
    ring: 'ring-zinc-200',
    label: 'Completed',
  },
  refunded: {
    bg: 'bg-zinc-100',
    text: 'text-zinc-700',
    ring: 'ring-zinc-200',
    label: 'Refunded',
  },
};

export function customerBookingStatusTone(status: BookingStatus): CustomerBookingStatusTone {
  return CUSTOMER_BOOKING_STATUS_TONES[status];
}

/** Tailwind classes for My Bookings status chips — one entry per BookingStatus. */
export const MY_BOOKING_STATUS_CHIP_CLASS: Record<BookingStatus, string> = {
  pending_payment: 'bg-amber-50 text-amber-700 ring-amber-200',
  pending_approval: 'bg-amber-50 text-amber-700 ring-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  superseded: 'bg-violet-50 text-violet-800 ring-violet-200',
  cancelled: 'bg-rose-50 text-rose-700 ring-rose-200',
  refunded: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  draft: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  completed: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
};

export function myBookingStatusChipClass(status: BookingStatus): string {
  return MY_BOOKING_STATUS_CHIP_CLASS[status];
}

export type AdminBookingBadgeTone = 'emerald' | 'amber' | 'rose' | 'sky' | 'zinc' | 'violet';

export function adminBookingStatusBadgeTone(status: BookingStatus): AdminBookingBadgeTone {
  switch (status) {
    case 'confirmed':
    case 'completed':
      return status === 'confirmed' ? 'emerald' : 'zinc';
    case 'pending_payment':
    case 'pending_approval':
      return 'amber';
    case 'cancelled':
    case 'refunded':
      return 'rose';
    case 'superseded':
      return 'violet';
    case 'draft':
      return 'sky';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export type CustomerBookingBannerVariant = 'pending' | 'confirmed' | 'cancelled' | 'superseded' | 'neutral';

export function customerBookingBannerCopy(status: BookingStatus): {
  variant: CustomerBookingBannerVariant;
  headline: string;
  copy: string;
  paymentStatusLabel: string;
} {
  switch (status) {
    case 'pending_approval':
      return {
        variant: 'pending',
        headline: 'Awaiting booking approval',
        copy: 'Payment proof received. The office will verify your UPI payment and documents before confirming your stay.',
        paymentStatusLabel: 'Under admin review',
      };
    case 'pending_payment':
      return {
        variant: 'pending',
        headline: 'Booking awaiting payment',
        copy: 'Your beds are held for you. Complete payment to confirm the stay — if the hold lapses, the beds are released.',
        paymentStatusLabel: 'Awaiting payment',
      };
    case 'confirmed':
      return {
        variant: 'confirmed',
        headline: 'Booking confirmed',
        copy: 'Your stay is locked in. The operator will reach out with check-in instructions.',
        paymentStatusLabel: 'Paid',
      };
    case 'superseded':
      return {
        variant: 'superseded',
        headline: 'Superseded',
        copy: 'This booking was replaced by a newer confirmed booking.',
        paymentStatusLabel: 'Superseded',
      };
    case 'cancelled':
      return {
        variant: 'cancelled',
        headline: 'Booking cancelled',
        copy: 'This booking is no longer active. Contact your PG if you have questions about settlement.',
        paymentStatusLabel: 'Cancelled',
      };
    case 'refunded':
      return {
        variant: 'cancelled',
        headline: 'Booking refunded',
        copy: 'This booking is no longer active. Contact your PG if you have questions about settlement.',
        paymentStatusLabel: 'Refunded',
      };
    case 'completed':
      return {
        variant: 'neutral',
        headline: 'Stay completed',
        copy: 'This booking has finished. Contact your PG if you need checkout or refund help.',
        paymentStatusLabel: 'Completed',
      };
    case 'draft':
      return {
        variant: 'neutral',
        headline: 'Draft booking',
        copy: 'This booking is not submitted yet.',
        paymentStatusLabel: 'Draft',
      };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Whether cancelBooking may mutate this booking. */
export function isBookingCancellableStatus(status: string): boolean {
  if (!isBookingStatus(status)) return false;
  return !isTerminalBookingLifecycleStatus(status);
}

export function bookingCancellationBlockedReason(
  bookingCode: string,
  status: BookingStatus,
): string {
  if (status === 'completed') {
    return `booking ${bookingCode} is completed — past cancellation`;
  }
  if (isSupersededBookingStatus(status)) {
    return `booking ${bookingCode} was superseded by a newer confirmed booking`;
  }
  if (isTerminalBookingLifecycleStatus(status)) {
    return `booking ${bookingCode} is already ${status}`;
  }
  return `booking ${bookingCode} cannot be cancelled`;
}

export function bookingTimelineDetailForStatus(status: BookingStatus): string | null {
  switch (status) {
    case 'pending_approval':
      return 'Payment proof submitted — awaiting admin approval in Operations';
    case 'pending_payment':
      return 'Bed held — resident must pay and upload proof';
    case 'superseded':
      return 'Replaced by a newer confirmed booking for the same stay';
    case 'cancelled':
      return 'Booking cancelled — no longer active';
    case 'refunded':
      return 'Booking refunded';
    case 'completed':
      return 'Stay completed';
    case 'confirmed':
      return 'Booking confirmed — resident stay active';
    case 'draft':
      return 'Draft booking — not submitted';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function bookingTimelineKindForStatus(
  status: BookingStatus,
): 'approved' | 'rejected' | 'cancelled' | 'submitted' | 'status_changed' {
  if (status === 'confirmed' || status === 'completed') return 'approved';
  if (status === 'cancelled' || status === 'refunded' || status === 'superseded') return 'cancelled';
  if (status === 'pending_approval' || status === 'pending_payment' || status === 'draft') {
    return 'submitted';
  }
  return 'status_changed';
}
