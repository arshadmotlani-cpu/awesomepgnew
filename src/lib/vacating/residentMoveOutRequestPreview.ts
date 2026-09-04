/**
 * SSOT — resident move-out request preview (projection only; no writes).
 */
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings } from '@/src/db/schema';
import { todayString } from '@/src/lib/dates';
import { resolveFinalPeriodRentInvoiceOutstandingForBooking } from '@/src/lib/checkout/checkoutSettlementV2Compute';
import { loadVacatingBillingPresentation } from '@/src/lib/vacating/loadVacatingBillingPresentation';
import {
  buildResidentMoveOutRentSection,
  type ResidentMoveOutRentSection,
} from '@/src/lib/vacating/residentMoveOutRentPresentation';
import {
  buildResidentMoveOutElectricityPreview,
  type ResidentMoveOutElectricityPreview,
} from '@/src/lib/vacating/residentMoveOutElectricityPreview';
import { buildResidentMoveOutRefundSummary } from '@/src/lib/residents/residentMoveOutRefundSummary';
import {
  buildVacatingDateConfirmation,
  formatBedAvailableLabel,
  formatFinalStayDateLabel,
} from '@/src/lib/vacating/vacatingBedSemantics';
import type { NoticeSettlementDisplay } from '@/src/lib/vacating/noticeDeductionPresentation';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';

export type ResidentMoveOutNoticePreview = {
  noticeSubmittedDate: string;
  requiredNoticeDays: number;
  selectedMoveOutDate: string;
  noticeGivenDays: number;
  compliant: boolean;
  statusLabel: string;
};

export type ResidentMoveOutSettlementSummary = {
  depositHeldPaise: number;
  rentThroughVacatingPaise: number;
  unusedPrepaidRentPaise: number;
  electricityDuePaise: number | null;
  electricityPending: boolean;
  otherDeductionsPaise: number;
  estimatedWalletPaise: number;
  showApproxPrefix: boolean;
};

export type ResidentMoveOutRequestPreview = {
  vacatingDate: string;
  finalStayDateLabel: string;
  bedAvailableLabel: string;
  rentChargedThroughLabel: string;
  billingCycleNote: string;
  rent: ResidentMoveOutRentSection;
  electricity: ResidentMoveOutElectricityPreview;
  notice: ResidentMoveOutNoticePreview;
  settlement: ResidentMoveOutSettlementSummary;
};

export async function buildResidentMoveOutRequestPreview(input: {
  bookingId: string;
  vacatingDate: string;
  noticeGivenDate?: string;
  monthlyRentPaiseSnapshot?: number;
}): Promise<ResidentMoveOutRequestPreview | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.vacatingDate)) return null;

  const noticeGivenDate = input.noticeGivenDate ?? todayString();

  const [booking] = await db
    .select({
      stayType: bookings.stayType,
      durationMode: bookings.durationMode,
      monthlyRentPaise: bookings.subtotalPaise,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (!booking) return null;

  const monthlyRentPaise =
    input.monthlyRentPaiseSnapshot ?? booking.monthlyRentPaise ?? 0;

  const [presentation, finalPeriodInvoice, electricity] = await Promise.all([
    loadVacatingBillingPresentation({
      bookingId: input.bookingId,
      noticeGivenDate,
      vacatingDate: input.vacatingDate,
      monthlyRentPaiseSnapshot: monthlyRentPaise,
      stayType: booking.stayType,
      durationMode: booking.durationMode,
      treatAsApprovedForTail: true,
      mode: 'estimate',
    }),
    resolveFinalPeriodRentInvoiceOutstandingForBooking({
      bookingId: input.bookingId,
      vacatingDate: input.vacatingDate,
    }),
    buildResidentMoveOutElectricityPreview({
      bookingId: input.bookingId,
      vacatingDate: input.vacatingDate,
    }),
  ]);

  if (!presentation) return null;

  const { waterfall, noticeDisplay } = presentation;
  const depositHeldPaise =
    presentation.estimatedSettlement.depositHeldPaise ?? presentation.ctx.depositHeldPaise;
  const rent = buildResidentMoveOutRentSection({
    vacatingDate: input.vacatingDate,
    monthlyRentPaise,
    coverage: presentation.coverage,
    waterfall,
    finalPeriodInvoice,
  });

  const refundSummary = buildResidentMoveOutRefundSummary(waterfall, {
    isEstimate: true,
    tailRentInvoicePaise: waterfall.outstandingRentInvoicePaise,
  });

  const electricityPending =
    electricity.finalAmountPending || refundSummary.electricityPending === true;
  const electricityDuePaise =
    electricityPending || electricity.finalAmountPaise == null
      ? null
      : electricity.finalAmountPaise;

  const settlement: ResidentMoveOutSettlementSummary = {
    depositHeldPaise,
    rentThroughVacatingPaise: rent.rentThroughVacatingPaise,
    unusedPrepaidRentPaise: refundSummary.netUnusedRentWalletCreditPaise,
    electricityDuePaise,
    electricityPending,
    otherDeductionsPaise:
      refundSummary.noticeDeductionPaise + refundSummary.otherDeductionsPaise,
    estimatedWalletPaise: refundSummary.estimatedRefundPaise,
    showApproxPrefix: true,
  };

  const notice = buildNoticePreview(noticeDisplay, noticeGivenDate, input.vacatingDate);
  const dateConfirmation = buildVacatingDateConfirmation(input.vacatingDate);

  return {
    vacatingDate: input.vacatingDate,
    finalStayDateLabel: dateConfirmation.finalStayDateLabel,
    bedAvailableLabel: formatBedAvailableLabel(input.vacatingDate),
    rentChargedThroughLabel: formatFinalStayDateLabel(input.vacatingDate),
    billingCycleNote: rent.billingCycleNote,
    rent,
    electricity,
    notice,
    settlement,
  };
}

function buildNoticePreview(
  notice: NoticeSettlementDisplay,
  noticeSubmittedDate: string,
  vacatingDate: string,
): ResidentMoveOutNoticePreview {
  const requiredNoticeDays = notice.noticeRequiredDays ?? VACATING_NOTICE_MIN_DAYS;
  const noticeGivenDays = notice.noticeGivenDays ?? 0;
  const compliant = (notice.missingNoticeDays ?? 0) <= 0;
  return {
    noticeSubmittedDate,
    requiredNoticeDays,
    selectedMoveOutDate: vacatingDate,
    noticeGivenDays,
    compliant,
    statusLabel: compliant
      ? 'Compliant — no notice deduction'
      : `Short by ${notice.missingNoticeDays} day${notice.missingNoticeDays === 1 ? '' : 's'} — notice charge may apply`,
  };
}
