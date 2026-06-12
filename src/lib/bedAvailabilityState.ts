/** Shared bed availability labels for admin map + customer bed picker. */

export type BedAvailabilityKind =
  | 'open_now'
  | 'pre_bookable'
  | 'notice'
  | 'occupied'
  | 'reserved'
  | 'hold_interest'
  | 'maintenance'
  | 'blocked';

export type BedAvailabilityView = {
  kind: BedAvailabilityKind;
  label: string;
  sublabel?: string;
};

export function deriveBedAvailabilityView(input: {
  bedStatus: 'available' | 'maintenance' | 'blocked';
  isOccupiedToday: boolean;
  isAvailableNow?: boolean;
  vacatingDate?: string | null;
  vacatingStatus?: 'pending' | 'approved' | null;
  preBookableFrom?: string | null;
  reservedFrom?: string | null;
  nextAvailableDate?: string | null;
  interestCount?: number;
  occupantFirstName?: string | null;
}): BedAvailabilityView {
  if (input.bedStatus === 'maintenance') {
    return { kind: 'maintenance', label: 'Maintenance' };
  }
  if (input.bedStatus === 'blocked') {
    return { kind: 'blocked', label: 'Blocked' };
  }

  if (input.reservedFrom) {
    return {
      kind: 'reserved',
      label: 'Reserved',
      sublabel: `From ${formatShortDate(input.reservedFrom)}`,
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
      return {
        kind: 'notice',
        label: input.occupantFirstName ?? 'Occupied',
        sublabel: `Notice · leaves ${formatShortDate(input.vacatingDate)}`,
      };
    }
    return {
      kind: 'occupied',
      label: input.occupantFirstName ?? 'Occupied',
      sublabel: input.preBookableFrom
        ? `Until ${formatShortDate(input.preBookableFrom)}`
        : undefined,
    };
  }

  if (input.isAvailableNow) {
    const interest = input.interestCount ?? 0;
    if (interest > 0) {
      return {
        kind: 'hold_interest',
        label: 'Open now',
        sublabel: `${interest} checkout${interest === 1 ? '' : 's'} in progress`,
      };
    }
    return { kind: 'open_now', label: 'Open · book now' };
  }

  const from = input.preBookableFrom ?? input.nextAvailableDate;
  if (from) {
    return {
      kind: 'pre_bookable',
      label: 'Pre-book',
      sublabel: `From ${formatShortDate(from)}`,
    };
  }

  return { kind: 'occupied', label: 'Unavailable' };
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const ADMIN_BED_KIND_CLASS: Record<BedAvailabilityKind, string> = {
  open_now:
    'border-emerald-400/50 bg-emerald-500/10 text-emerald-100 hover:border-emerald-400/70',
  pre_bookable: 'border-sky-400/50 bg-sky-500/10 text-sky-100 hover:border-sky-400/70',
  notice: 'border-orange-400/50 bg-orange-500/10 text-orange-100 hover:border-orange-400/70',
  occupied: 'border-emerald-400/40 bg-emerald-500/5 text-white hover:border-emerald-400/60',
  reserved: 'border-violet-400/50 bg-violet-500/10 text-violet-100 hover:border-violet-400/70',
  hold_interest: 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100 hover:border-cyan-400/60',
  maintenance: 'border-amber-400/50 bg-amber-500/10 text-amber-100 hover:border-amber-400/70',
  blocked: 'border-rose-400/50 bg-rose-500/10 text-rose-200 hover:border-rose-400/70',
};
