import { buildResidentElectricityAccount } from '@/src/lib/residents/residentElectricityAccount';
import { getVacatingForBooking } from '@/src/db/queries/customer';
import { firstOfMonth } from '@/src/services/billing';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { buildVacatingSettlementPreview } from '@/src/lib/vacating/computeVacatingSettlementPreview';
import { db } from '@/src/db/client';
import { bookings } from '@/src/db/schema';
import { eq } from 'drizzle-orm';

export type DepositRefundSettlementPreview = {
  depositBalancePaise: number;
  /** Refundable deposit after notice/tail (settlement waterfall deposit bucket). */
  depositRefundablePaise: number;
  /** Unused prepaid rent credit after notice offset. */
  unusedPrepaidRentPaise: number;
  /** Outstanding electricity to deduct when a bill exists. */
  electricityAdjustmentPaise: number | null;
  /** Total refundable at checkout (deposit + unused prepaid − electricity when known). */
  refundAmountPaise: number | null;
  /** True when checkout-month electricity has not been generated yet. */
  electricityPending: boolean;
  electricityBillingMonth: string | null;
  paidUntilDate: string | null;
  vacatingDate: string | null;
};

/**
 * Resident-facing settlement preview before refund request.
 * Auto-includes outstanding electricity when the checkout-month bill exists.
 * When vacating is active, loads V2 settlement SSOT for unused prepaid rent.
 */
export async function getDepositRefundSettlementPreview(
  bookingId: string,
): Promise<DepositRefundSettlementPreview> {
  const [depositSummary, elecAccount, vacatingRes, bookingRow] = await Promise.all([
    getDepositSummaryForBooking(bookingId),
    buildResidentElectricityAccount(bookingId),
    getVacatingForBooking(bookingId),
    db
      .select({
        stayType: bookings.stayType,
        durationMode: bookings.durationMode,
        monthlyRentPaise: bookings.subtotalPaise,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  const depositBalancePaise = Math.max(0, depositSummary?.refundableBalancePaise ?? 0);
  const vacating = vacatingRes.ok && vacatingRes.data ? vacatingRes.data : null;

  let depositRefundablePaise = depositBalancePaise;
  let unusedPrepaidRentPaise = 0;
  let paidUntilDate: string | null = null;
  let vacatingDate: string | null = null;

  if (
    vacating &&
    ['pending', 'approved'].includes(vacating.status) &&
    bookingRow
  ) {
    vacatingDate = vacating.vacatingDate;
    const monthlyRentPaise =
      vacating.monthlyRentPaiseSnapshot ?? bookingRow.monthlyRentPaise ?? 0;
    const settlementPreview = await buildVacatingSettlementPreview({
      bookingId,
      noticeGivenDate: vacating.noticeGivenDate,
      vacatingDate: vacating.vacatingDate,
      monthlyRentPaiseSnapshot: monthlyRentPaise,
      noticeRentCoveredDays: vacating.noticeRentCoveredDays,
      noticeChargeableDays: vacating.noticeChargeableDays,
      deductionPaise: vacating.deductionPaise,
      noticeBreakdownJson: vacating.noticeBreakdownJson,
      stayType: bookingRow.stayType,
      durationMode: bookingRow.durationMode,
    });

    if (settlementPreview) {
      depositRefundablePaise = settlementPreview.estimatedRefundableDepositPaise;
      unusedPrepaidRentPaise = settlementPreview.estimatedUnusedRentCreditPaise;
      const billingSection = settlementPreview.sections.find((s) => s.title === 'Billing & dates');
      const paidUntilRow = billingSection?.rows.find((r) => r.id === 'paid_until');
      if (paidUntilRow?.value && paidUntilRow.value !== '—') {
        paidUntilDate = paidUntilRow.value;
      }
    }
  }

  const electricityAdjustmentPaise = elecAccount.netOutstandingPaise;
  const grossBeforeElec = depositRefundablePaise + unusedPrepaidRentPaise;

  if (electricityAdjustmentPaise > 0) {
    const latestInvoice = elecAccount.invoices.find((i) => i.outstandingPaise > 0);
    return {
      depositBalancePaise,
      depositRefundablePaise,
      unusedPrepaidRentPaise,
      electricityAdjustmentPaise,
      refundAmountPaise: Math.max(0, grossBeforeElec - electricityAdjustmentPaise),
      electricityPending: false,
      electricityBillingMonth: latestInvoice?.billingMonth.slice(0, 7) ?? null,
      paidUntilDate,
      vacatingDate,
    };
  }

  if (vacatingDate && elecAccount.invoices.length === 0) {
    return {
      depositBalancePaise,
      depositRefundablePaise,
      unusedPrepaidRentPaise,
      electricityAdjustmentPaise: null,
      refundAmountPaise: null,
      electricityPending: true,
      electricityBillingMonth: firstOfMonth(vacatingDate).slice(0, 7),
      paidUntilDate,
      vacatingDate,
    };
  }

  return {
    depositBalancePaise,
    depositRefundablePaise,
    unusedPrepaidRentPaise,
    electricityAdjustmentPaise: 0,
    refundAmountPaise: grossBeforeElec,
    electricityPending: false,
    electricityBillingMonth: null,
    paidUntilDate,
    vacatingDate,
  };
}
