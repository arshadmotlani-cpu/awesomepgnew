import { buildResidentElectricityAccount } from '@/src/lib/residents/residentElectricityAccount';
import { getVacatingForBooking } from '@/src/db/queries/customer';
import { firstOfMonth } from '@/src/services/billing';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

export type DepositRefundSettlementPreview = {
  depositBalancePaise: number;
  /** Outstanding electricity to deduct when a bill exists. */
  electricityAdjustmentPaise: number | null;
  /** deposit − electricity when electricity is known. */
  refundAmountPaise: number | null;
  /** True when checkout-month electricity has not been generated yet. */
  electricityPending: boolean;
  electricityBillingMonth: string | null;
};

/**
 * Resident-facing settlement preview before refund request.
 * Auto-includes outstanding electricity when the checkout-month bill exists.
 */
export async function getDepositRefundSettlementPreview(
  bookingId: string,
): Promise<DepositRefundSettlementPreview> {
  const [depositSummary, elecAccount, vacatingRes] = await Promise.all([
    getDepositSummaryForBooking(bookingId),
    buildResidentElectricityAccount(bookingId),
    getVacatingForBooking(bookingId),
  ]);
  const depositBalancePaise = Math.max(0, depositSummary?.refundableBalancePaise ?? 0);
  const electricityAdjustmentPaise = elecAccount.netOutstandingPaise;

  if (electricityAdjustmentPaise > 0) {
    const latestInvoice = elecAccount.invoices.find((i) => i.outstandingPaise > 0);
    return {
      depositBalancePaise,
      electricityAdjustmentPaise,
      refundAmountPaise: Math.max(0, depositBalancePaise - electricityAdjustmentPaise),
      electricityPending: false,
      electricityBillingMonth: latestInvoice?.billingMonth.slice(0, 7) ?? null,
    };
  }

  const vacatingDate = vacatingRes.ok && vacatingRes.data ? vacatingRes.data.vacatingDate : null;
  if (vacatingDate && elecAccount.invoices.length === 0) {
    return {
      depositBalancePaise,
      electricityAdjustmentPaise: null,
      refundAmountPaise: null,
      electricityPending: true,
      electricityBillingMonth: firstOfMonth(vacatingDate).slice(0, 7),
    };
  }

  return {
    depositBalancePaise,
    electricityAdjustmentPaise: 0,
    refundAmountPaise: depositBalancePaise,
    electricityPending: false,
    electricityBillingMonth: null,
  };
}
