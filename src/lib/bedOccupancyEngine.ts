/**
 * Phase 1 — Bed occupancy SSOT (pure functions).
 *
 * Works with existing data (finite monthly stay_range, 2099 sentinel) and
 * future unbounded monthly ranges without schema migration.
 */

import { RESERVE_CLEANING_BUFFER_DAYS } from '@/src/lib/bedReservePolicy';
import {
  addDays,
  customerBookableFromDate,
  formatDate,
  isOpenEndedStayEnd,
  parseDate,
  todayString,
} from '@/src/lib/dates';
import { isMonthlyStayType, stayTypeFromPricingMode } from '@/src/lib/stayType';
import type { BedAvailabilityView, CustomerBedAvailabilityView } from '@/src/lib/bedAvailabilityState';
import { reserveBufferDate } from '@/src/lib/bedReservePolicy';

export const TURNOVER_BUFFER_DAYS = RESERVE_CLEANING_BUFFER_DAYS;

export type PublicBedOccupancyState =
  | 'available'
  | 'reserved'
  | 'occupied'
  | 'notice_period'
  | 'maintenance';

export type AdminBedOccupancyState = PublicBedOccupancyState | 'checkout_pending';

export type CheckoutSettlementSnapshot = {
  id: string;
  status: string;
  /** When true, fixed stays skip checkout-pending (deposit-only auto-expiry). */
  suppressed?: boolean;
  depositRequiredPaise?: number;
  depositHeldPaise?: number;
  electricityPending?: boolean;
  damageChargesPaise?: number;
};

export type BedOccupancyInput = {
  bedStatus: 'available' | 'maintenance' | 'blocked';
  asOfDate?: string;

  isOccupiedToday: boolean;
  isAvailableNow?: boolean;
  manualOccupied?: boolean;

  stayType?: string | null;
  durationMode?: string | null;
  expectedCheckoutDate?: string | null;
  /** upper(stay_range) of active reservation — may be billing placeholder for monthly. */
  stayUpper?: string | null;

  vacatingDate?: string | null;
  vacatingStatus?: 'pending' | 'approved' | null;

  checkoutSettlement?: CheckoutSettlementSnapshot | null;

  activeBedReserveCheckIn?: string | null;
  manualReservedCheckIn?: string | null;
  reservedFrom?: string | null;

  occupantFirstName?: string | null;
  interestCount?: number;
  noticeInterestCount?: number;
  holdInterestCount?: number;
  availableUntilDate?: string | null;
};

export type BedOccupancySnapshot = {
  publicState: PublicBedOccupancyState;
  adminState: AdminBedOccupancyState;
  bookableFromDate: string | null;
  checkoutSettlementId: string | null;
  isMonthlyTenancy: boolean;
  isFixedTenancy: boolean;
};

const ACTIVE_CHECKOUT_SETTLEMENT_STATUSES = new Set([
  'awaiting_resident_details',
  'awaiting_admin_review',
  'approved',
  'refund_pending',
]);

export function isMonthlyTenancy(input: {
  stayType?: string | null;
  durationMode?: string | null;
}): boolean {
  if (input.stayType && isMonthlyStayType(input.stayType)) return true;
  const mode = input.durationMode ?? '';
  return mode === 'open_ended' || mode === 'monthly';
}

export function isFixedTenancy(input: {
  stayType?: string | null;
  durationMode?: string | null;
}): boolean {
  if (input.stayType === 'fixed_date_stay') return true;
  const mode = input.durationMode ?? '';
  return mode === 'fixed_stay' || mode === 'daily' || mode === 'weekly';
}

/** Contractual checkout for fixed stays only — never monthly billing period ends. */
export function resolveContractualCheckoutDate(input: BedOccupancyInput): string | null {
  if (isMonthlyTenancy(input)) return null;
  if (!input.isOccupiedToday && !input.checkoutSettlement && !isFixedTenancy(input)) {
    return null;
  }
  const fromExpected = customerBookableFromDate(input.expectedCheckoutDate ?? null);
  if (fromExpected) return fromExpected;
  const fromStay = customerBookableFromDate(input.stayUpper ?? null);
  if (fromStay && !isOpenEndedStayEnd(fromStay)) return fromStay;
  return null;
}

export function checkoutSettlementRequiresWorkflow(
  settlement: CheckoutSettlementSnapshot,
): boolean {
  if (settlement.suppressed) return false;
  const depositHeld = settlement.depositHeldPaise ?? 0;
  const depositRequired = settlement.depositRequiredPaise ?? 0;
  if (depositHeld > 0 || depositRequired > 0) return true;
  if (settlement.electricityPending) return true;
  if ((settlement.damageChargesPaise ?? 0) > 0) return true;
  return false;
}

export function hasActiveCheckoutSettlement(
  settlement?: CheckoutSettlementSnapshot | null,
): boolean {
  if (!settlement?.id || !settlement.status) return false;
  return ACTIVE_CHECKOUT_SETTLEMENT_STATUSES.has(settlement.status);
}

/** Monthly: mandatory. Fixed: only when refund/electricity/damages workflow exists. */
export function isCheckoutPending(input: BedOccupancyInput): boolean {
  const settlement = input.checkoutSettlement;
  if (!hasActiveCheckoutSettlement(settlement)) return false;
  if (isMonthlyTenancy(input)) return true;
  if (isFixedTenancy(input)) {
    return checkoutSettlementRequiresWorkflow(settlement!);
  }
  return checkoutSettlementRequiresWorkflow(settlement!);
}

function applyTurnoverBuffer(isoDate: string): string {
  return formatDate(addDays(parseDate(isoDate), TURNOVER_BUFFER_DAYS));
}

export function resolveBookableFromDate(input: BedOccupancyInput): string | null {
  if (input.bedStatus !== 'available') return null;
  if (isCheckoutPending(input)) return null;

  if (input.isOccupiedToday) {
    if (isMonthlyTenancy(input)) {
      if (input.vacatingStatus === 'approved' && input.vacatingDate) {
        return applyTurnoverBuffer(input.vacatingDate);
      }
      return null;
    }
    const checkout = resolveContractualCheckoutDate(input);
    if (checkout) return applyTurnoverBuffer(checkout);
    return null;
  }

  if (input.vacatingStatus === 'approved' && input.vacatingDate) {
    return applyTurnoverBuffer(input.vacatingDate);
  }

  const checkout = resolveContractualCheckoutDate(input);
  if (checkout && isFixedTenancy(input)) {
    return applyTurnoverBuffer(checkout);
  }

  return customerBookableFromDate(input.stayUpper ?? input.expectedCheckoutDate ?? null);
}

function isVacatingPastDue(vacatingDate: string, asOf: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(vacatingDate) && vacatingDate < asOf;
}

export function computeBedOccupancySnapshot(input: BedOccupancyInput): BedOccupancySnapshot {
  const asOf = input.asOfDate ?? todayString();
  const monthly = isMonthlyTenancy(input);
  const fixed = isFixedTenancy(input);
  const checkoutPending = isCheckoutPending(input);

  if (input.bedStatus === 'maintenance') {
    return {
      publicState: 'maintenance',
      adminState: 'maintenance',
      bookableFromDate: null,
      checkoutSettlementId: null,
      isMonthlyTenancy: monthly,
      isFixedTenancy: fixed,
    };
  }

  if (checkoutPending) {
    return {
      publicState: 'occupied',
      adminState: 'checkout_pending',
      bookableFromDate: null,
      checkoutSettlementId: input.checkoutSettlement?.id ?? null,
      isMonthlyTenancy: monthly,
      isFixedTenancy: fixed,
    };
  }

  if (input.manualOccupied && !input.isOccupiedToday) {
    return {
      publicState: 'occupied',
      adminState: 'occupied',
      bookableFromDate: null,
      checkoutSettlementId: null,
      isMonthlyTenancy: monthly,
      isFixedTenancy: fixed,
    };
  }

  const reserveCheckIn = input.manualReservedCheckIn ?? input.activeBedReserveCheckIn;
  if (reserveCheckIn && !input.isOccupiedToday) {
    return {
      publicState: 'reserved',
      adminState: 'reserved',
      bookableFromDate: resolveBookableFromDate(input),
      checkoutSettlementId: null,
      isMonthlyTenancy: monthly,
      isFixedTenancy: fixed,
    };
  }

  if (input.reservedFrom && !input.isOccupiedToday) {
    return {
      publicState: 'reserved',
      adminState: 'reserved',
      bookableFromDate: resolveBookableFromDate(input),
      checkoutSettlementId: null,
      isMonthlyTenancy: monthly,
      isFixedTenancy: fixed,
    };
  }

  const hasNotice =
    Boolean(input.vacatingDate) &&
    (input.vacatingStatus === 'pending' || input.vacatingStatus === 'approved');

  if (input.isOccupiedToday && hasNotice && input.vacatingDate) {
    return {
      publicState: 'notice_period',
      adminState: 'notice_period',
      bookableFromDate: resolveBookableFromDate(input),
      checkoutSettlementId: null,
      isMonthlyTenancy: monthly,
      isFixedTenancy: fixed,
    };
  }

  if (input.isOccupiedToday) {
    return {
      publicState: 'occupied',
      adminState: 'occupied',
      bookableFromDate: resolveBookableFromDate(input),
      checkoutSettlementId: null,
      isMonthlyTenancy: monthly,
      isFixedTenancy: fixed,
    };
  }

  if (input.isAvailableNow ?? (input.bedStatus === 'available' && !input.reservedFrom)) {
    return {
      publicState: 'available',
      adminState: 'available',
      bookableFromDate: resolveBookableFromDate(input),
      checkoutSettlementId: null,
      isMonthlyTenancy: monthly,
      isFixedTenancy: fixed,
    };
  }

  const bookable = resolveBookableFromDate(input);
  if (bookable && fixed && !monthly) {
    return {
      publicState: 'available',
      adminState: 'available',
      bookableFromDate: bookable,
      checkoutSettlementId: null,
      isMonthlyTenancy: monthly,
      isFixedTenancy: fixed,
    };
  }

  if (bookable && !monthly && !input.isOccupiedToday) {
    return {
      publicState: 'available',
      adminState: 'available',
      bookableFromDate: bookable,
      checkoutSettlementId: null,
      isMonthlyTenancy: monthly,
      isFixedTenancy: fixed,
    };
  }

  return {
    publicState: 'occupied',
    adminState: 'occupied',
    bookableFromDate: null,
    checkoutSettlementId: null,
    isMonthlyTenancy: monthly,
    isFixedTenancy: fixed,
  };
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

export function toCustomerAvailabilityView(
  input: BedOccupancyInput,
  snapshot?: BedOccupancySnapshot,
): CustomerBedAvailabilityView {
  const snap = snapshot ?? computeBedOccupancySnapshot(input);

  if (input.bedStatus === 'blocked') {
    return { kind: 'blocked', label: 'Unavailable' };
  }

  if (snap.publicState === 'maintenance') {
    return { kind: 'maintenance', label: 'Maintenance' };
  }

  if (snap.adminState === 'checkout_pending') {
    return { kind: 'occupied', label: 'Occupied' };
  }

  if (input.manualOccupied) {
    return { kind: 'occupied', label: 'Occupied' };
  }

  if (snap.publicState === 'reserved' && input.activeBedReserveCheckIn) {
    const checkIn = input.activeBedReserveCheckIn;
    const bufferIso = reserveBufferDate(checkIn);
    return {
      kind: 'reserved',
      label: 'Held',
      sublabel: `Short stays until ${formatShortDate(bufferIso)} · holder moves in ${formatShortDate(checkIn)}`,
    };
  }

  if (snap.publicState === 'reserved' && input.reservedFrom) {
    return {
      kind: 'booked',
      label: 'Booked',
      sublabel: `From ${formatShortDate(input.reservedFrom)}`,
    };
  }

  if (snap.publicState === 'notice_period' && input.vacatingDate) {
    const interest = input.noticeInterestCount ?? 0;
    const pastDue = isVacatingPastDue(input.vacatingDate, input.asOfDate ?? todayString());
    const leaveLabel = pastDue
      ? input.vacatingStatus === 'approved'
        ? `Move-out was ${formatShortDate(input.vacatingDate)} · checkout pending`
        : `Notice expired ${formatShortDate(input.vacatingDate)} · admin review needed`
      : input.vacatingStatus === 'approved'
        ? `Available from ${formatShortDate(input.vacatingDate)}`
        : `Leaving ${formatShortDate(input.vacatingDate)}`;
    return {
      kind: 'notice',
      label: pastDue ? 'Move-out overdue' : 'Notice period',
      sublabel: interest > 0 ? `${leaveLabel} · ${interest} interested` : leaveLabel,
    };
  }

  if (snap.publicState === 'occupied' && input.isOccupiedToday) {
    const checkout = resolveContractualCheckoutDate(input);
    const bookable = snap.bookableFromDate;
    const sublabel =
      fixedTenancySublabel(input, checkout, bookable) ??
      (checkout && !isMonthlyTenancy(input) ? `Until ${formatShortDate(checkout)}` : undefined);
    return { kind: 'occupied', label: 'Occupied', sublabel };
  }

  if (snap.publicState === 'available' && (input.isAvailableNow ?? false)) {
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

  const bookable = snap.bookableFromDate;
  if (bookable && snap.publicState === 'available') {
    return {
      kind: 'pre_bookable',
      label: 'Available soon',
      sublabel: `From ${formatShortDate(bookable)}`,
    };
  }

  if (snap.publicState === 'occupied' || !input.isAvailableNow) {
    return { kind: 'occupied', label: 'Occupied' };
  }

  return { kind: 'blocked', label: 'Unavailable' };
}

function fixedTenancySublabel(
  input: BedOccupancyInput,
  checkout: string | null,
  bookable: string | null,
): string | undefined {
  if (!isFixedTenancy(input) || !checkout) return undefined;
  if (bookable) {
    return `Available from ${formatShortDate(bookable)}`;
  }
  return `Until ${formatShortDate(checkout)}`;
}

export function toAdminAvailabilityView(
  input: BedOccupancyInput,
  snapshot?: BedOccupancySnapshot,
): BedAvailabilityView {
  const snap = snapshot ?? computeBedOccupancySnapshot(input);

  if (input.bedStatus === 'maintenance') {
    return { kind: 'maintenance', label: 'Maintenance' };
  }
  if (input.bedStatus === 'blocked') {
    return { kind: 'blocked', label: 'Blocked' };
  }

  if (snap.adminState === 'checkout_pending') {
    const name = input.occupantFirstName ?? 'Resident';
    return {
      kind: 'notice',
      label: name,
      sublabel: 'Checkout pending · open settlement',
    };
  }

  if (input.manualOccupied && !input.isOccupiedToday) {
    return {
      kind: 'occupied',
      label: 'Occupied',
      sublabel: 'Marked occupied · shown on website',
    };
  }

  const reserveCheckIn = input.manualReservedCheckIn ?? input.activeBedReserveCheckIn;
  if (reserveCheckIn && !input.isOccupiedToday) {
    return {
      kind: 'reserved',
      label: 'Reserved',
      sublabel: `Check-in ${formatShortDate(reserveCheckIn)} · daily/weekly OK`,
    };
  }

  if (input.reservedFrom && !input.isOccupiedToday) {
    return {
      kind: 'booked',
      label: 'Booked',
      sublabel: `Move-in ${formatShortDate(input.reservedFrom)}`,
    };
  }

  if (snap.adminState === 'notice_period' && input.vacatingDate) {
    const pastDue = isVacatingPastDue(input.vacatingDate, input.asOfDate ?? todayString());
    const interest = input.noticeInterestCount ?? 0;
    if (pastDue) {
      return {
        kind: 'notice',
        label: input.occupantFirstName ?? 'Occupied',
        sublabel: `Move-out overdue · complete checkout settlement`,
      };
    }
    if (input.vacatingStatus === 'approved') {
      return {
        kind: 'pre_bookable',
        label: input.occupantFirstName ?? 'Occupied',
        sublabel: `Hold from ${formatShortDate(input.vacatingDate)}`,
      };
    }
    return {
      kind: 'notice',
      label: input.occupantFirstName ?? 'Occupied',
      sublabel:
        `Notice · leaves ${formatShortDate(input.vacatingDate)}` +
        (interest > 0 ? ` · ${interest} interested` : ''),
    };
  }

  if (snap.adminState === 'occupied' && input.isOccupiedToday) {
    const checkout = resolveContractualCheckoutDate(input);
    const bookable = snap.bookableFromDate;
    let sublabel: string | undefined;
    if (isFixedTenancy(input) && checkout) {
      sublabel = bookable
        ? `Available from ${formatShortDate(bookable)}`
        : `Until ${formatShortDate(checkout)}`;
    } else if (checkout && !isMonthlyTenancy(input)) {
      sublabel = `Until ${formatShortDate(checkout)}`;
    }
    return {
      kind: 'occupied',
      label: input.occupantFirstName ?? 'Occupied',
      sublabel,
    };
  }

  if (snap.adminState === 'available' && (input.isAvailableNow ?? false)) {
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

  const bookable = snap.bookableFromDate;
  if (bookable) {
    return {
      kind: 'pre_bookable',
      label: 'Hold',
      sublabel: `From ${formatShortDate(bookable)}`,
    };
  }

  return { kind: 'occupied', label: 'Unavailable' };
}

export function canBookBedFromSnapshot(
  input: BedOccupancyInput,
  snapshot?: BedOccupancySnapshot,
): boolean {
  const snap = snapshot ?? computeBedOccupancySnapshot(input);
  if (snap.adminState === 'checkout_pending') return false;
  if (snap.publicState === 'maintenance' || input.bedStatus !== 'available') return false;
  if (input.manualOccupied || input.isOccupiedToday) return false;
  if (input.vacatingDate) return false;
  if (snap.publicState === 'occupied' && isMonthlyTenancy(input)) return false;
  if (input.isAvailableNow) return true;
  if (snap.bookableFromDate) return true;
  if (input.activeBedReserveCheckIn) return true;
  return false;
}

export function bedOccupancyInputFromStayFields(fields: {
  stayType?: string | null;
  durationMode?: string | null;
}): { stayType?: string | null; durationMode?: string | null } {
  const stayType =
    fields.stayType ??
    (fields.durationMode ? stayTypeFromPricingMode(fields.durationMode) : null);
  return { stayType, durationMode: fields.durationMode ?? null };
}
