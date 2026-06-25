/**
 * Booking Draft — customer funnel SSOT between bed selection and persisted booking row.
 * All funnel screens read pricing from server quotes mapped into this shape; no UI math.
 */
import { computeNewBookingCheckoutTotals } from '@/src/lib/billing/bookingCheckoutTotals';
import type { BookingSummaryData } from '@/src/components/customer/checkout/BookingSummaryRail';
import type { PricingLineItem } from '@/src/lib/pricing/types';
import type { StayType } from '@/src/lib/stayType';

export type BookingDraftPricing = {
  rentSubtotalPaise: number;
  depositPaise: number;
  discountPaise?: number;
  couponDiscountPaise?: number;
  taxPaise?: number;
  totalDuePaise: number;
  breakdownLineItems?: PricingLineItem[];
};

export type BookingDraft = {
  pgSlug?: string;
  pgName?: string;
  roomId?: string;
  roomNumber?: string;
  bedId?: string;
  bedCode?: string;
  stayType?: StayType | string;
  checkIn?: string;
  checkOut?: string | null;
  stayNights?: number;
  pricing: BookingDraftPricing | null;
};

export function hasBookingDraftSelection(draft: Pick<BookingDraft, 'bedId' | 'bedCode' | 'roomNumber' | 'roomId'>): boolean {
  return Boolean(draft.bedId || draft.bedCode || draft.roomNumber || draft.roomId);
}

export function quoteToBookingDraftPricing(input: {
  subtotalPaise: number;
  depositPaise: number;
  discountPaise?: number;
  priorOutstanding?: Parameters<typeof computeNewBookingCheckoutTotals>[0]['priorOutstanding'];
  breakdownLineItems?: PricingLineItem[];
}): BookingDraftPricing {
  const checkout = computeNewBookingCheckoutTotals({
    rentSubtotalPaise: input.subtotalPaise,
    depositRequiredPaise: input.depositPaise,
    priorOutstanding: input.priorOutstanding,
  });
  return {
    rentSubtotalPaise: input.subtotalPaise,
    depositPaise: input.depositPaise,
    discountPaise: input.discountPaise,
    taxPaise: 0,
    totalDuePaise: checkout.totalToCollectTodayPaise,
    breakdownLineItems: input.breakdownLineItems,
  };
}

export function bookingDraftToSummaryData(draft: BookingDraft): BookingSummaryData {
  return {
    pgSlug: draft.pgSlug,
    pgName: draft.pgName,
    roomId: draft.roomId,
    roomNumber: draft.roomNumber,
    bedId: draft.bedId,
    bedCode: draft.bedCode,
    stayType: draft.stayType,
    moveInDate: draft.checkIn,
    moveOutDate: draft.checkOut ?? undefined,
    stayNights: draft.stayNights,
    rentPaise: draft.pricing?.rentSubtotalPaise,
    depositPaise: draft.pricing?.depositPaise,
    discountPaise: draft.pricing?.discountPaise,
    couponDiscountPaise: draft.pricing?.couponDiscountPaise,
    taxPaise: draft.pricing?.taxPaise,
    totalDuePaise: draft.pricing?.totalDuePaise,
  };
}

export function persistedBookingToSummaryData(input: {
  pgSlug: string;
  pgName: string;
  roomId?: string | null;
  roomNumber?: string | null;
  bedId?: string | null;
  bedCode?: string | null;
  stayType: string;
  checkIn?: string | null;
  checkOut?: string | null;
  stayNights?: number | null;
  subtotalPaise: number;
  depositPaise: number;
  discountPaise?: number;
  totalDuePaise: number;
}): BookingSummaryData {
  return bookingDraftToSummaryData({
    pgSlug: input.pgSlug,
    pgName: input.pgName,
    roomId: input.roomId ?? undefined,
    roomNumber: input.roomNumber ?? undefined,
    bedId: input.bedId ?? undefined,
    bedCode: input.bedCode ?? undefined,
    stayType: input.stayType,
    checkIn: input.checkIn ?? undefined,
    checkOut: input.checkOut,
    stayNights: input.stayNights ?? undefined,
    pricing: {
      rentSubtotalPaise: input.subtotalPaise,
      depositPaise: input.depositPaise,
      discountPaise: input.discountPaise,
      totalDuePaise: input.totalDuePaise,
    },
  });
}
