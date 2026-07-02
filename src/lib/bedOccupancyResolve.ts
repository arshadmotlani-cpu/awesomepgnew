/**
 * Phase 1 — single resolution path from raw bed facts → engine snapshot + flags.
 * All occupancy surfaces must use this module (or helpers it exports).
 */

import type { BedAvailabilityView, CustomerBedAvailabilityView } from '@/src/lib/bedAvailabilityState';
import {
  canBookBedFromSnapshot,
  computeBedOccupancySnapshot,
  toAdminAvailabilityView,
  toCustomerAvailabilityView,
  type BedOccupancyInput,
  type BedOccupancySnapshot,
  type CheckoutSettlementSnapshot,
} from '@/src/lib/bedOccupancyEngine';
import { todayString } from '@/src/lib/dates';

export type RawBedOccupancyFacts = {
  bedId: string;
  bedStatus: 'available' | 'maintenance' | 'blocked';
  asOfDate?: string;
  isOccupiedToday: boolean;
  manualOccupied?: boolean;
  stayType?: string | null;
  durationMode?: string | null;
  expectedCheckoutDate?: string | null;
  stayUpper?: string | null;
  vacatingDate?: string | null;
  vacatingStatus?: 'pending' | 'approved' | null;
  checkoutSettlement?: CheckoutSettlementSnapshot | null;
  manualReservedCheckIn?: string | null;
  activeBedReserveCheckIn?: string | null;
  reservedFrom?: string | null;
  occupantFirstName?: string | null;
  interestCount?: number;
  noticeInterestCount?: number;
  holdInterestCount?: number;
  availableUntilDate?: string | null;
};

export type ResolvedBedOccupancy = {
  input: BedOccupancyInput;
  snapshot: BedOccupancySnapshot;
  /** Public "free today" — green Available, not Available soon. */
  isOpenNow: boolean;
  /** Eligible to start a booking flow today. */
  isBookable: boolean;
  /** Occupied for KPI / occupancy % (checked-in, notice, checkout pending, manual). */
  isOccupiedForKpi: boolean;
  adminView: BedAvailabilityView;
  customerView: CustomerBedAvailabilityView;
};

export function rawFactsToInput(facts: RawBedOccupancyFacts): BedOccupancyInput {
  return {
    bedStatus: facts.bedStatus,
    asOfDate: facts.asOfDate,
    isOccupiedToday: facts.isOccupiedToday,
    manualOccupied: facts.manualOccupied,
    stayType: facts.stayType,
    durationMode: facts.durationMode,
    expectedCheckoutDate: facts.expectedCheckoutDate,
    stayUpper: facts.stayUpper,
    vacatingDate: facts.vacatingDate,
    vacatingStatus: facts.vacatingStatus,
    checkoutSettlement: facts.checkoutSettlement,
    manualReservedCheckIn: facts.manualReservedCheckIn,
    activeBedReserveCheckIn: facts.activeBedReserveCheckIn,
    reservedFrom: facts.reservedFrom,
    occupantFirstName: facts.occupantFirstName,
    interestCount: facts.interestCount,
    noticeInterestCount: facts.noticeInterestCount,
    holdInterestCount: facts.holdInterestCount,
    availableUntilDate: facts.availableUntilDate,
  };
}

/** True when the bed shows as immediately available (not "Available soon"). */
export function isOpenNowFromSnapshot(
  snapshot: BedOccupancySnapshot,
  input: BedOccupancyInput,
): boolean {
  if (input.bedStatus !== 'available') return false;
  if (snapshot.publicState !== 'available') return false;
  const asOf = input.asOfDate ?? todayString();
  if (snapshot.bookableFromDate && snapshot.bookableFromDate > asOf) return false;
  return true;
}

/** Beds counted as occupied in dashboards and occupancy %. */
export function isOccupiedForKpi(
  snapshot: BedOccupancySnapshot,
  input: BedOccupancyInput,
): boolean {
  if (input.bedStatus === 'maintenance' || input.bedStatus === 'blocked') return false;
  if (input.isOccupiedToday) return true;
  if (snapshot.adminState === 'checkout_pending') return true;
  if (input.manualOccupied) return true;
  if (snapshot.publicState === 'occupied' || snapshot.publicState === 'notice_period') {
    return true;
  }
  return false;
}

export function resolveBedOccupancy(facts: RawBedOccupancyFacts): ResolvedBedOccupancy {
  const input = rawFactsToInput(facts);
  const snapshot = computeBedOccupancySnapshot(input);
  const isOpenNow = isOpenNowFromSnapshot(snapshot, input);
  const inputWithOpen: BedOccupancyInput = { ...input, isAvailableNow: isOpenNow };
  return {
    input: inputWithOpen,
    snapshot,
    isOpenNow,
    isBookable: canBookBedFromSnapshot(inputWithOpen, snapshot),
    isOccupiedForKpi: isOccupiedForKpi(snapshot, input),
    adminView: toAdminAvailabilityView(inputWithOpen, snapshot),
    customerView: toCustomerAvailabilityView(inputWithOpen, snapshot),
  };
}

export type OccupancyAggregateCounts = {
  totalBeds: number;
  openNowBeds: number;
  bookableBeds: number;
  occupiedBeds: number;
  reservedBeds: number;
  noticeBeds: number;
  checkoutPendingBeds: number;
  maintenanceBeds: number;
  blockedBeds: number;
  vacatingSoon: number;
  occupancyPct: number;
};

export function resolveFromSelectorBed(bed: {
  bedId: string;
  status: 'available' | 'maintenance' | 'blocked';
  isAvailableNow?: boolean;
  isOccupiedToday?: boolean;
  manualOccupied?: boolean;
  nextAvailableDate?: string | null;
  vacatingDate?: string | null;
  vacatingStatus?: 'pending' | 'approved' | null;
  reservedFrom?: string | null;
  activeBedReserveCheckIn?: string | null;
  stayType?: string | null;
  durationMode?: string | null;
  expectedCheckoutDate?: string | null;
  checkoutSettlement?: RawBedOccupancyFacts['checkoutSettlement'];
  interestCount?: number;
  noticeInterestCount?: number;
  availableUntilDate?: string | null;
}): ResolvedBedOccupancy {
  return resolveBedOccupancy({
    bedId: bed.bedId,
    bedStatus: bed.status,
    isOccupiedToday: Boolean(bed.isOccupiedToday),
    manualOccupied: bed.manualOccupied,
    stayType: bed.stayType,
    durationMode: bed.durationMode,
    expectedCheckoutDate: bed.expectedCheckoutDate,
    stayUpper: bed.nextAvailableDate,
    vacatingDate: bed.vacatingDate,
    vacatingStatus: bed.vacatingStatus,
    checkoutSettlement: bed.checkoutSettlement,
    activeBedReserveCheckIn: bed.activeBedReserveCheckIn,
    reservedFrom: bed.reservedFrom,
    noticeInterestCount: bed.noticeInterestCount,
    holdInterestCount: bed.interestCount,
    availableUntilDate: bed.availableUntilDate,
  });
}

export function aggregateOccupancyCounts(
  resolved: ResolvedBedOccupancy[],
): OccupancyAggregateCounts {
  const totalBeds = resolved.length;
  let openNowBeds = 0;
  let bookableBeds = 0;
  let occupiedBeds = 0;
  let reservedBeds = 0;
  let noticeBeds = 0;
  let checkoutPendingBeds = 0;
  let maintenanceBeds = 0;
  let blockedBeds = 0;
  let vacatingSoon = 0;

  for (const r of resolved) {
    if (r.isOpenNow) openNowBeds += 1;
    if (r.isBookable) bookableBeds += 1;
    if (r.isOccupiedForKpi) occupiedBeds += 1;
    if (r.snapshot.publicState === 'reserved') reservedBeds += 1;
    if (r.snapshot.publicState === 'notice_period') noticeBeds += 1;
    if (r.snapshot.adminState === 'checkout_pending') checkoutPendingBeds += 1;
    if (r.input.bedStatus === 'maintenance') maintenanceBeds += 1;
    if (r.input.bedStatus === 'blocked') blockedBeds += 1;
    if (r.input.vacatingDate) vacatingSoon += 1;
  }

  const occupancyDenominator = totalBeds - maintenanceBeds - blockedBeds;
  const occupancyPct =
    occupancyDenominator === 0
      ? 0
      : Math.round((occupiedBeds / occupancyDenominator) * 1000) / 10;

  return {
    totalBeds,
    openNowBeds,
    bookableBeds,
    occupiedBeds,
    reservedBeds,
    noticeBeds,
    checkoutPendingBeds,
    maintenanceBeds,
    blockedBeds,
    vacatingSoon,
    occupancyPct,
  };
}
