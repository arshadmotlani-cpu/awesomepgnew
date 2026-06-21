/** Shared bed availability labels for admin map + customer bed picker. */

import { customerBookableFromDate, isOpenEndedStayEnd } from '@/src/lib/dates';
import { reserveBufferDate } from '@/src/lib/bedReservePolicy';
export type BedAvailabilityKind =
  | 'open_now'
  | 'pre_bookable'
  | 'notice'
  | 'occupied'
  | 'booked'
  | 'reserved'
  | 'hold_interest'
  | 'maintenance'
  | 'blocked';

export type BedAvailabilityView = {
  kind: BedAvailabilityKind;
  label: string;
  sublabel?: string;
};

export type CustomerBedAvailabilityView = {
  kind: BedAvailabilityKind;
  label: string;
  sublabel?: string;
};

export function deriveBedAvailabilityView(input: {
  bedStatus: 'available' | 'maintenance' | 'blocked';
  manualOccupied?: boolean;
  isOccupiedToday: boolean;
  isAvailableNow?: boolean;
  vacatingDate?: string | null;
  vacatingStatus?: 'pending' | 'approved' | null;
  preBookableFrom?: string | null;
  reservedFrom?: string | null;
  /** Admin manual reserve or customer 50% hold check-in. */
  manualReservedCheckIn?: string | null;
  nextAvailableDate?: string | null;
  interestCount?: number;
  noticeInterestCount?: number;
  occupantFirstName?: string | null;
  hasPendingBooking?: boolean;
}): BedAvailabilityView {
  if (input.bedStatus === 'maintenance') {
    return { kind: 'maintenance', label: 'Maintenance' };
  }
  if (input.bedStatus === 'blocked') {
    return { kind: 'blocked', label: 'Blocked' };
  }

  if (input.manualOccupied && !input.isOccupiedToday) {
    return {
      kind: 'occupied',
      label: 'Occupied',
      sublabel: 'Marked occupied · shown on website',
    };
  }

  if (input.manualReservedCheckIn && !input.isOccupiedToday) {
    return {
      kind: 'reserved',
      label: 'Reserved',
      sublabel: `Check-in ${formatShortDate(input.manualReservedCheckIn)} · daily/weekly OK`,
    };
  }

  if (input.reservedFrom && !input.isOccupiedToday) {
    return {
      kind: 'booked',
      label: 'Booked',
      sublabel: `Move-in ${formatShortDate(input.reservedFrom)}`,
    };
  }

  if (input.isOccupiedToday) {
    if (input.vacatingDate && input.vacatingStatus === 'approved') {
      return {
        kind: 'pre_bookable',
        label: input.occupantFirstName ?? 'Occupied',
        sublabel: `Pre-book from ${formatShortDate(input.vacatingDate)}`,
      };
    }
    if (input.vacatingDate && input.vacatingStatus === 'pending') {
      const interest = input.noticeInterestCount ?? 0;
      return {
        kind: 'notice',
        label: input.occupantFirstName ?? 'Occupied',
        sublabel:
          `Notice · leaves ${formatShortDate(input.vacatingDate)}` +
          (interest > 0 ? ` · ${interest} interested` : ''),
      };
    }
    return {
      kind: 'occupied',
      label: input.occupantFirstName ?? 'Occupied',
      sublabel:
        input.preBookableFrom && !isOpenEndedStayEnd(input.preBookableFrom)
          ? `Until ${formatShortDate(input.preBookableFrom)}`
          : undefined,
    };
  }

  if (input.isAvailableNow) {
    const holdInterest = input.interestCount ?? 0;
    const bedInterest = input.noticeInterestCount ?? 0;
    if (holdInterest > 0) {
      return {
        kind: 'hold_interest',
        label: 'Open now',
        sublabel: `${holdInterest} booking${holdInterest === 1 ? '' : 's'} in progress`,
      };
    }
    if (bedInterest > 0) {
      return {
        kind: 'open_now',
        label: 'Open · book now',
        sublabel: `${bedInterest} interested`,
      };
    }
    return { kind: 'open_now', label: 'Open · book now' };
  }

  const from = customerBookableFromDate(input.preBookableFrom ?? input.nextAvailableDate);
  if (from) {
    return {
      kind: 'pre_bookable',
      label: 'Pre-book',
      sublabel: `From ${formatShortDate(from)}`,
    };
  }

  return { kind: 'occupied', label: 'Unavailable' };
}

/** Customer-facing labels — no admin jargon, privacy-safe. */
export function deriveCustomerBedAvailabilityView(input: {
  bedStatus: 'available' | 'maintenance' | 'blocked';
  isAvailableNow: boolean;
  manualOccupied?: boolean;
  nextAvailableDate?: string | null;
  vacatingDate?: string | null;
  vacatingStatus?: 'pending' | 'approved' | null;
  reservedFrom?: string | null;
  activeBedReserveCheckIn?: string | null;
  availableUntilDate?: string | null;
  noticeInterestCount?: number;
  holdInterestCount?: number;
}): CustomerBedAvailabilityView {
  if (input.bedStatus === 'maintenance') {
    return { kind: 'maintenance', label: 'Maintenance' };
  }
  if (input.bedStatus === 'blocked') {
    return { kind: 'blocked', label: 'Unavailable' };
  }

  if (input.manualOccupied) {
    return { kind: 'occupied', label: 'Occupied' };
  }

  if (input.activeBedReserveCheckIn) {
    const checkIn = input.activeBedReserveCheckIn;
    const bufferIso = reserveBufferDate(checkIn);
    return {
      kind: 'reserved',
      label: 'Reserved',
      sublabel: `Short stays until ${formatShortDate(bufferIso)} · holder moves in ${formatShortDate(checkIn)}`,
    };
  }

  if (input.reservedFrom) {
    return {
      kind: 'booked',
      label: 'Booked',
      sublabel: `From ${formatShortDate(input.reservedFrom)}`,
    };
  }

  const realisticNextDate = customerBookableFromDate(input.nextAvailableDate);
  const isNotice =
    Boolean(input.vacatingDate) &&
    (input.vacatingStatus === 'pending' || input.vacatingStatus === 'approved');
  const isOccupied =
    !input.isAvailableNow && !realisticNextDate && !isNotice && !input.reservedFrom;

  if (isNotice && input.vacatingDate) {
    const interest = input.noticeInterestCount ?? 0;
    const leaveLabel =
      input.vacatingStatus === 'approved'
        ? `Available from ${formatShortDate(input.vacatingDate)}`
        : `Leaving ${formatShortDate(input.vacatingDate)}`;
    return {
      kind: 'notice',
      label: 'Notice period',
      sublabel:
        interest > 0
          ? `${leaveLabel} · ${interest} interested`
          : leaveLabel,
    };
  }

  if (input.availableUntilDate) {
    return {
      kind: 'pre_bookable',
      label: 'Limited availability',
      sublabel: `Until ${formatShortDate(input.availableUntilDate)}`,
    };
  }

  if (input.isAvailableNow) {
    const holds = input.holdInterestCount ?? 0;
    const interested = input.noticeInterestCount ?? 0;
    return {
      kind: 'open_now',
      label: 'Available',
      sublabel:
        interested > 0
          ? `${interested} ${interested === 1 ? 'person is' : 'people are'} interested · book now`
          : holds > 0
            ? `${holds} checkout${holds === 1 ? '' : 's'} in progress — still bookable`
            : 'Book this bed',
    };
  }

  if (realisticNextDate) {
    return {
      kind: 'pre_bookable',
      label: 'Available soon',
      sublabel: `From ${formatShortDate(realisticNextDate)}`,
    };
  }

  if (isOccupied || !input.isAvailableNow) {
    return { kind: 'occupied', label: 'Occupied' };
  }

  return { kind: 'blocked', label: 'Unavailable' };
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const ADMIN_BED_KIND_CLASS: Record<BedAvailabilityKind, string> = {
  open_now:
    'border-emerald-400/60 bg-emerald-500/15 text-emerald-50 hover:border-emerald-400/80',
  pre_bookable: 'border-sky-400/50 bg-sky-500/12 text-sky-50 hover:border-sky-400/70',
  notice: 'border-orange-400/55 bg-orange-500/12 text-orange-50 hover:border-orange-400/75',
  occupied: 'border-zinc-500/50 bg-zinc-700/40 text-zinc-100 hover:border-zinc-400/60',
  booked: 'border-violet-400/55 bg-violet-500/15 text-violet-50 hover:border-violet-400/75',
  reserved: 'border-violet-400/55 bg-violet-500/15 text-violet-50 hover:border-violet-400/75',
  hold_interest: 'border-cyan-400/50 bg-cyan-500/12 text-cyan-50 hover:border-cyan-400/70',
  maintenance: 'border-amber-400/50 bg-amber-500/12 text-amber-50 hover:border-amber-400/70',
  blocked: 'border-rose-400/50 bg-rose-500/12 text-rose-100 hover:border-rose-400/70',
};

export const CUSTOMER_BED_KIND_CLASS: Record<BedAvailabilityKind, string> = {
  open_now:
    'border-emerald-400/45 bg-emerald-500/12 text-emerald-100 hover:border-emerald-400/65',
  pre_bookable: 'border-sky-400/45 bg-sky-500/10 text-sky-100 hover:border-sky-400/60',
  notice: 'border-orange-400/45 bg-orange-500/12 text-orange-100 hover:border-orange-400/60',
  occupied: 'border-zinc-500/40 bg-zinc-800/50 text-zinc-300',
  booked: 'border-violet-400/45 bg-violet-500/12 text-violet-100',
  reserved: 'border-violet-400/45 bg-violet-500/12 text-violet-100',
  hold_interest: 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100',
  maintenance: 'border-amber-400/45 bg-amber-500/10 text-amber-100',
  blocked: 'border-rose-400/40 bg-rose-500/10 text-rose-200/80',
};
