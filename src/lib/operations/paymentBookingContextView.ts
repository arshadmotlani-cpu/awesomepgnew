import type { PricingSnapshot } from '@/src/db/schema/bookings';
import type { PricingLineItem } from '@/src/lib/pricing/types';
import {
  formatRentLineLabel,
  rentLineItemsOnly,
  shouldShowHybridRentBreakdown,
} from '@/src/lib/pricing/formatRentLines';
import { diffDays, parseDate } from '@/src/lib/dates';
import { titleCase } from '@/src/lib/format';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import {
  paymentCategoryBusinessLabel,
  stayTypeBusinessLabel,
} from '@/src/lib/stayType';

export type PaymentBookingContextView = {
  bookingCode: string | null;
  bookingType: string;
  pgName: string;
  roomNumber: string | null;
  bedCode: string | null;
  moveInDate: string | null;
  moveOutDate: string | null;
  duration: string | null;
  pricingRule: string | null;
  rentCalculation: string | null;
  rentAmountPaise: number | null;
  depositPolicy: string | null;
  requiredDepositPaise: number | null;
};

type BookingDetailsInput = {
  moveInDate: string | null;
  moveOutDate: string | null;
  durationMode: string | null;
  stayType: string | null;
  bookingStatus: string | null;
  subtotalPaise: number | null;
  discountPaise: number | null;
  depositRequiredPaise: number | null;
  rentDuePaise: number | null;
  pricingSnapshot: PricingSnapshot | null;
  rentLineItems?: PricingLineItem[];
};

function pricingRuleLabel(
  durationMode: string | null,
  snapshot: PricingSnapshot | null,
): string | null {
  if (!durationMode) return null;
  if (durationMode === 'reserve') return 'Hold Booking';
  if (durationMode === 'open_ended' || durationMode === 'monthly') return 'Monthly';
  if (durationMode === 'daily') return 'Daily';
  if (durationMode === 'weekly') return 'Weekly';
  if (durationMode === 'fixed_stay') {
    const bed = snapshot?.perBed?.[0];
    if (bed?.durationMode === 'weekly') return 'Weekly';
    if (bed?.durationMode === 'daily') return 'Daily';
    return 'Fixed Stay';
  }
  return titleCase(durationMode.replace(/_/g, ' '));
}

function bookingTypeForItem(
  item: Pick<PendingPaymentReviewItem, 'kind' | 'paymentTypeLabel'>,
  details: BookingDetailsInput | null,
): string {
  switch (item.kind) {
    case 'rent':
    case 'electricity':
    case 'extension':
    case 'deposit_link':
      return paymentCategoryBusinessLabel(item.kind);
    case 'qr':
      if (details) {
        return stayTypeBusinessLabel(
          { stayType: details.stayType, durationMode: details.durationMode },
          'ops',
        );
      }
      return paymentCategoryBusinessLabel('qr');
  }
}

function depositPolicyLabel(
  durationMode: string | null,
  depositRequiredPaise: number,
  rentSubtotalPaise: number,
): string {
  if (depositRequiredPaise <= 0) return 'No deposit required';
  if (durationMode === 'reserve') return 'Hold booking — deposit on activation';
  if (durationMode === 'open_ended' || durationMode === 'monthly') {
    return '2 weeks deposit required';
  }
  if (rentSubtotalPaise > 0) {
    const pct = Math.round((depositRequiredPaise / rentSubtotalPaise) * 100);
    if (pct >= 45 && pct <= 55) return '50% deposit required';
  }
  if (
    durationMode === 'fixed_stay' ||
    durationMode === 'daily' ||
    durationMode === 'weekly'
  ) {
    return '50% deposit required';
  }
  return 'Deposit required';
}

function durationDetail(
  moveInDate: string | null,
  moveOutDate: string | null,
  durationMode: string | null,
  snapshot: PricingSnapshot | null,
): string | null {
  const bed = snapshot?.perBed?.[0];
  if (moveInDate && moveOutDate) {
    try {
      const nights = diffDays(parseDate(moveInDate), parseDate(moveOutDate));
      if (nights > 0) {
        if (
          durationMode === 'fixed_stay' ||
          durationMode === 'daily' ||
          durationMode === 'weekly' ||
          bed?.durationMode === 'daily' ||
          bed?.durationMode === 'weekly'
        ) {
          return `${nights} night${nights === 1 ? '' : 's'}`;
        }
      }
    } catch {
      // ignore invalid dates
    }
  }
  if (bed?.units) {
    if (bed.durationMode === 'weekly') {
      return `${bed.units} week${bed.units === 1 ? '' : 's'}`;
    }
    if (bed.durationMode === 'daily') {
      return `${bed.units} night${bed.units === 1 ? '' : 's'}`;
    }
    if (bed.durationMode === 'monthly' || bed.durationMode === 'open_ended') {
      return `${bed.units} month${bed.units === 1 ? '' : 's'}`;
    }
  }
  if (durationMode === 'open_ended' || durationMode === 'monthly') {
    return 'Open-ended monthly';
  }
  if (durationMode === 'reserve') return 'Bed hold';
  return null;
}

function rentCalculationSummary(input: {
  rentDuePaise: number | null;
  subtotalPaise: number | null;
  discountPaise: number | null;
  rentLineItems: PricingLineItem[];
}): string | null {
  const rentLines = rentLineItemsOnly(input.rentLineItems);
  if (rentLines.length > 0) {
    if (shouldShowHybridRentBreakdown(input.rentLineItems) && rentLines.length > 1) {
      return rentLines.map((line) => formatRentLineLabel(line)).join(' · ');
    }
    if (rentLines.length === 1) return formatRentLineLabel(rentLines[0]!);
    return rentLines.map((line) => formatRentLineLabel(line)).join(' · ');
  }

  const rentDue = input.rentDuePaise ?? 0;
  const subtotal = input.subtotalPaise ?? 0;
  const discount = input.discountPaise ?? 0;
  if (rentDue <= 0 && subtotal <= 0) return null;
  if (discount > 0 && subtotal > 0) {
    return `Rent subtotal minus ₹${(discount / 100).toLocaleString('en-IN')} discount`;
  }
  if (subtotal > 0 && subtotal !== rentDue) {
    return 'Rent after discounts';
  }
  return 'Quoted rent for stay';
}

export function buildPaymentBookingContext(
  item: Pick<
    PendingPaymentReviewItem,
    | 'kind'
    | 'pgName'
    | 'bookingCode'
    | 'roomNumber'
    | 'bedCode'
    | 'paymentTypeLabel'
    | 'subtitle'
    | 'amountPaise'
    | 'bookingPaymentReview'
  >,
  details: BookingDetailsInput | null,
): PaymentBookingContextView {
  const rentDuePaise =
    item.bookingPaymentReview?.rentDuePaise ??
    details?.rentDuePaise ??
    (item.kind === 'rent' ? item.amountPaise : null);

  const snapshot = details?.pricingSnapshot ?? null;
  const rentLineItems = details?.rentLineItems ?? snapshot?.rentLineItems ?? [];
  const durationMode = details?.durationMode ?? null;
  const depositRequired = details?.depositRequiredPaise ?? 0;
  const rentSubtotal = details?.subtotalPaise ?? rentDuePaise ?? 0;

  if (item.kind === 'rent') {
    return {
      bookingCode: item.bookingCode,
      bookingType: 'Rent Payment',
      pgName: item.pgName,
      roomNumber: item.roomNumber,
      bedCode: item.bedCode,
      moveInDate: null,
      moveOutDate: null,
      duration: item.subtitle?.match(/\d{4}-\d{2}/)?.[0] ?? null,
      pricingRule: 'Monthly billing cycle',
      rentCalculation: 'Outstanding rent invoice',
      rentAmountPaise: rentDuePaise,
      depositPolicy: 'Not applicable',
      requiredDepositPaise: null,
    };
  }

  if (item.kind === 'electricity') {
    return {
      bookingCode: item.bookingCode,
      bookingType: 'Electricity Payment',
      pgName: item.pgName,
      roomNumber: item.roomNumber,
      bedCode: item.bedCode,
      moveInDate: null,
      moveOutDate: null,
      duration: null,
      pricingRule: 'Metered electricity',
      rentCalculation: 'Outstanding electricity invoice',
      rentAmountPaise: item.amountPaise,
      depositPolicy: 'Not applicable',
      requiredDepositPaise: null,
    };
  }

  if (item.kind === 'extension') {
    return {
      bookingCode: item.bookingCode,
      bookingType: 'Stay Extension',
      pgName: item.pgName,
      roomNumber: item.roomNumber,
      bedCode: item.bedCode,
      moveInDate: details?.moveInDate ?? null,
      moveOutDate: details?.moveOutDate ?? null,
      duration: durationDetail(
        details?.moveInDate ?? null,
        details?.moveOutDate ?? null,
        durationMode,
        snapshot,
      ),
      pricingRule: pricingRuleLabel(durationMode, snapshot),
      rentCalculation: 'Extension quote',
      rentAmountPaise: item.amountPaise,
      depositPolicy: 'Not applicable',
      requiredDepositPaise: null,
    };
  }

  if (item.kind === 'deposit_link') {
    return {
      bookingCode: item.bookingCode,
      bookingType: 'Deposit Collection',
      pgName: item.pgName,
      roomNumber: item.roomNumber,
      bedCode: item.bedCode,
      moveInDate: details?.moveInDate ?? null,
      moveOutDate: details?.moveOutDate ?? null,
      duration: null,
      pricingRule: null,
      rentCalculation: null,
      rentAmountPaise: null,
      depositPolicy: 'Additional deposit requested',
      requiredDepositPaise: item.amountPaise,
    };
  }

  return {
    bookingCode: item.bookingCode,
    bookingType: bookingTypeForItem(item, details),
    pgName: item.pgName,
    roomNumber: item.roomNumber,
    bedCode: item.bedCode ?? null,
    moveInDate: details?.moveInDate ?? null,
    moveOutDate: details?.moveOutDate ?? null,
    duration: durationDetail(
      details?.moveInDate ?? null,
      details?.moveOutDate ?? null,
      durationMode,
      snapshot,
    ),
    pricingRule: pricingRuleLabel(durationMode, snapshot),
    rentCalculation: rentCalculationSummary({
      rentDuePaise,
      subtotalPaise: details?.subtotalPaise ?? null,
      discountPaise: details?.discountPaise ?? null,
      rentLineItems,
    }),
    rentAmountPaise: rentDuePaise,
    depositPolicy: depositPolicyLabel(durationMode, depositRequired, rentSubtotal),
    requiredDepositPaise: depositRequired > 0 ? depositRequired : null,
  };
}

export type { BookingDetailsInput };
