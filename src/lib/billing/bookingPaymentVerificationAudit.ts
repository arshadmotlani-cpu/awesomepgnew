/**
 * Read-only booking checkout payment verification audit — display math only.
 */
import { breakdownBookingCheckoutPayment } from '@/src/lib/billing/bookingCheckoutTotals';
import { paiseToInr } from '@/src/lib/format';

const TOLERANCE_PAISE = 100;

export type BookingPaymentVerificationAudit = {
  recordId: string;
  status: 'approved' | 'rejected';
  expectedContractPaise: number;
  screenshotAmountPaise: number;
  differencePaise: number;
  differenceLabel: string;
  hasScreenshot: boolean;
};

export function expectedContractPaiseFromBooking(booking: {
  subtotalPaise: number;
  discountPaise: number;
  depositPaise: number;
  pricingSnapshot?: {
    depositCredit?: { appliedPaise?: number; adminTransferred?: boolean };
  } | null;
}): number {
  const breakdown = breakdownBookingCheckoutPayment(booking);
  return breakdown.rentDuePaise + breakdown.depositCashDuePaise;
}

export function screenshotAmountPaiseFromProofRecord(record: {
  proofSnapshotSubmittedPaise: number | null;
  confirmedAmountPaise: number | null;
  amountPaise: number;
}): number {
  if (record.proofSnapshotSubmittedPaise != null && record.proofSnapshotSubmittedPaise > 0) {
    return record.proofSnapshotSubmittedPaise;
  }
  if (record.confirmedAmountPaise != null && record.confirmedAmountPaise > 0) {
    return record.confirmedAmountPaise;
  }
  if (record.amountPaise > 0) return record.amountPaise;
  return 0;
}

export function formatVerificationDifferencePaise(
  expectedContractPaise: number,
  screenshotAmountPaise: number,
): { differencePaise: number; differenceLabel: string } {
  const raw = expectedContractPaise - screenshotAmountPaise;
  if (Math.abs(raw) <= TOLERANCE_PAISE) {
    return { differencePaise: 0, differenceLabel: paiseToInr(0) };
  }
  if (raw > 0) {
    return {
      differencePaise: raw,
      differenceLabel: paiseToInr(raw),
    };
  }
  return {
    differencePaise: Math.abs(raw),
    differenceLabel: `${paiseToInr(Math.abs(raw))} extra`,
  };
}

export function buildBookingPaymentVerificationAudit(input: {
  recordId: string;
  status: 'approved' | 'rejected';
  booking: {
    subtotalPaise: number;
    discountPaise: number;
    depositPaise: number;
    pricingSnapshot?: {
      depositCredit?: { appliedPaise?: number; adminTransferred?: boolean };
    } | null;
  };
  proofRecord: {
    proofSnapshotSubmittedPaise: number | null;
    confirmedAmountPaise: number | null;
    amountPaise: number;
    paymentScreenshotUrl: string | null;
  };
}): BookingPaymentVerificationAudit | null {
  const expectedContractPaise = expectedContractPaiseFromBooking(input.booking);
  const screenshotAmountPaise = screenshotAmountPaiseFromProofRecord(input.proofRecord);
  if (expectedContractPaise <= 0 && screenshotAmountPaise <= 0) return null;

  const { differencePaise, differenceLabel } = formatVerificationDifferencePaise(
    expectedContractPaise,
    screenshotAmountPaise,
  );

  return {
    recordId: input.recordId,
    status: input.status,
    expectedContractPaise,
    screenshotAmountPaise,
    differencePaise,
    differenceLabel,
    hasScreenshot: Boolean(input.proofRecord.paymentScreenshotUrl?.trim()),
  };
}
