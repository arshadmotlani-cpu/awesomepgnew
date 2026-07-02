/** Shared bed availability labels for admin map + customer bed picker. */

import {
  resolveBedOccupancy,
  type RawBedOccupancyFacts,
} from '@/src/lib/bedOccupancyResolve';
import type { BedOccupancyInput } from '@/src/lib/bedOccupancyEngine';

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

export type { BedOccupancyInput };

function toRawFacts(input: {
  bedStatus: 'available' | 'maintenance' | 'blocked';
  manualOccupied?: boolean;
  isOccupiedToday: boolean;
  isAvailableNow?: boolean;
  vacatingDate?: string | null;
  vacatingStatus?: 'pending' | 'approved' | null;
  preBookableFrom?: string | null;
  reservedFrom?: string | null;
  manualReservedCheckIn?: string | null;
  nextAvailableDate?: string | null;
  interestCount?: number;
  noticeInterestCount?: number;
  occupantFirstName?: string | null;
  stayType?: string | null;
  durationMode?: string | null;
  expectedCheckoutDate?: string | null;
  stayUpper?: string | null;
  checkoutSettlement?: RawBedOccupancyFacts['checkoutSettlement'];
  activeBedReserveCheckIn?: string | null;
}): RawBedOccupancyFacts {
  return {
    bedId: '',
    bedStatus: input.bedStatus,
    isOccupiedToday: input.isOccupiedToday,
    manualOccupied: input.manualOccupied,
    stayType: input.stayType,
    durationMode: input.durationMode,
    expectedCheckoutDate: input.expectedCheckoutDate,
    stayUpper: input.stayUpper ?? input.preBookableFrom ?? input.nextAvailableDate,
    vacatingDate: input.vacatingDate,
    vacatingStatus: input.vacatingStatus,
    checkoutSettlement: input.checkoutSettlement,
    manualReservedCheckIn: input.manualReservedCheckIn,
    activeBedReserveCheckIn: input.activeBedReserveCheckIn,
    reservedFrom: input.reservedFrom,
    occupantFirstName: input.occupantFirstName,
    interestCount: input.interestCount,
    noticeInterestCount: input.noticeInterestCount,
  };
}

export function deriveBedAvailabilityView(input: {
  bedStatus: 'available' | 'maintenance' | 'blocked';
  manualOccupied?: boolean;
  isOccupiedToday: boolean;
  isAvailableNow?: boolean;
  vacatingDate?: string | null;
  vacatingStatus?: 'pending' | 'approved' | null;
  preBookableFrom?: string | null;
  reservedFrom?: string | null;
  manualReservedCheckIn?: string | null;
  nextAvailableDate?: string | null;
  interestCount?: number;
  noticeInterestCount?: number;
  occupantFirstName?: string | null;
  hasPendingBooking?: boolean;
  stayType?: string | null;
  durationMode?: string | null;
  expectedCheckoutDate?: string | null;
  stayUpper?: string | null;
  checkoutSettlement?: RawBedOccupancyFacts['checkoutSettlement'];
  activeBedReserveCheckIn?: string | null;
}): BedAvailabilityView {
  return resolveBedOccupancy(toRawFacts(input)).adminView;
}

/** Customer-facing labels — no admin jargon, privacy-safe. */
export function deriveCustomerBedAvailabilityView(input: {
  bedStatus: 'available' | 'maintenance' | 'blocked';
  isAvailableNow: boolean;
  isOccupiedToday?: boolean;
  manualOccupied?: boolean;
  nextAvailableDate?: string | null;
  vacatingDate?: string | null;
  vacatingStatus?: 'pending' | 'approved' | null;
  reservedFrom?: string | null;
  activeBedReserveCheckIn?: string | null;
  availableUntilDate?: string | null;
  noticeInterestCount?: number;
  holdInterestCount?: number;
  stayType?: string | null;
  durationMode?: string | null;
  expectedCheckoutDate?: string | null;
  checkoutSettlement?: RawBedOccupancyFacts['checkoutSettlement'];
}): CustomerBedAvailabilityView {
  return resolveBedOccupancy({
    bedId: '',
    bedStatus: input.bedStatus,
    isOccupiedToday: Boolean(input.isOccupiedToday),
    manualOccupied: input.manualOccupied,
    stayType: input.stayType,
    durationMode: input.durationMode,
    expectedCheckoutDate: input.expectedCheckoutDate,
    stayUpper: input.nextAvailableDate,
    vacatingDate: input.vacatingDate,
    vacatingStatus: input.vacatingStatus,
    checkoutSettlement: input.checkoutSettlement,
    activeBedReserveCheckIn: input.activeBedReserveCheckIn,
    reservedFrom: input.reservedFrom,
    noticeInterestCount: input.noticeInterestCount,
    holdInterestCount: input.holdInterestCount,
    availableUntilDate: input.availableUntilDate,
  }).customerView;
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
  maintenance: 'border-rose-500/60 bg-rose-600/20 text-rose-50 hover:border-rose-400/80',
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
  maintenance: 'border-rose-500/50 bg-rose-600/15 text-rose-100',
  blocked: 'border-rose-400/40 bg-rose-500/10 text-rose-200/80',
};
