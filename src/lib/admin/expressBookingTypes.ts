/** Client-safe Express Booking types — no server imports. */

export type ExpressBookingStayType = 'fixed' | 'continue';

export type ExpressBookingPaymentStatus = 'paid_in_full' | 'partially_paid' | 'due_bill';

export type ExpressBookingActiveTenancy = {
  bookingId: string;
  bookingCode: string;
  bookingStatus: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedId: string;
  bedCode: string;
  moveInDate: string;
  stayType: string | null;
  durationMode: string;
  monthlyRentPaise: number;
  depositPaise: number;
  isVacating: boolean;
  expectedCheckoutDate: string | null;
};

export type ExpressBookingResidentContext = {
  customerId: string;
  fullName: string;
  email: string;
  phone: string;
  gender: 'male' | 'female' | 'other';
  kycStatus: string;
  tenancyStatus: 'active' | 'unassigned' | 'vacated' | 'vacating';
  walletCreditPaise: number;
  activeTenancy: ExpressBookingActiveTenancy | null;
  depositCollectedPaise: number;
  depositHeldPaise: number;
};

export type ExpressBookingQuote = {
  stayType: ExpressBookingStayType;
  checkInDate: string;
  checkOutDate: string | null;
  isHistorical: boolean;
  days: number;
  rentPaise: number;
  depositPaise: number;
  totalPaise: number;
  dailyRatePaise: number;
  monthlyRentPaise: number;
};

export type ExpressWalkInBedOption = {
  bedId: string;
  label: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  monthlyRatePaise: number;
  dailyRatePaise: number;
  depositPaise: number;
};

/** Coerce server action payloads to JSON-safe plain numbers (guards bigint / numeric strings). */
export function serializeExpressBookingContext(
  ctx: ExpressBookingResidentContext,
): ExpressBookingResidentContext {
  return {
    customerId: String(ctx.customerId),
    fullName: String(ctx.fullName ?? ''),
    email: String(ctx.email ?? ''),
    phone: String(ctx.phone ?? ''),
    gender: ctx.gender,
    kycStatus: String(ctx.kycStatus ?? ''),
    tenancyStatus: ctx.tenancyStatus,
    walletCreditPaise: Number(ctx.walletCreditPaise) || 0,
    depositCollectedPaise: Number(ctx.depositCollectedPaise) || 0,
    depositHeldPaise: Number(ctx.depositHeldPaise) || 0,
    activeTenancy: ctx.activeTenancy
      ? {
          bookingId: String(ctx.activeTenancy.bookingId),
          bookingCode: String(ctx.activeTenancy.bookingCode),
          bookingStatus: String(ctx.activeTenancy.bookingStatus),
          pgId: String(ctx.activeTenancy.pgId),
          pgName: String(ctx.activeTenancy.pgName ?? ''),
          roomNumber: String(ctx.activeTenancy.roomNumber ?? ''),
          bedId: String(ctx.activeTenancy.bedId),
          bedCode: String(ctx.activeTenancy.bedCode ?? ''),
          moveInDate: String(ctx.activeTenancy.moveInDate ?? ''),
          stayType: ctx.activeTenancy.stayType ? String(ctx.activeTenancy.stayType) : null,
          durationMode: String(ctx.activeTenancy.durationMode ?? ''),
          monthlyRentPaise: Number(ctx.activeTenancy.monthlyRentPaise) || 0,
          depositPaise: Number(ctx.activeTenancy.depositPaise) || 0,
          isVacating: Boolean(ctx.activeTenancy.isVacating),
          expectedCheckoutDate: ctx.activeTenancy.expectedCheckoutDate
            ? String(ctx.activeTenancy.expectedCheckoutDate)
            : null,
        }
      : null,
  };
}

export function serializeExpressBookingQuote(quote: ExpressBookingQuote): ExpressBookingQuote {
  return {
    stayType: quote.stayType,
    checkInDate: String(quote.checkInDate),
    checkOutDate: quote.checkOutDate ? String(quote.checkOutDate) : null,
    isHistorical: Boolean(quote.isHistorical),
    days: Number(quote.days) || 0,
    rentPaise: Number(quote.rentPaise) || 0,
    depositPaise: Number(quote.depositPaise) || 0,
    totalPaise: Number(quote.totalPaise) || 0,
    dailyRatePaise: Number(quote.dailyRatePaise) || 0,
    monthlyRentPaise: Number(quote.monthlyRentPaise) || 0,
  };
}
