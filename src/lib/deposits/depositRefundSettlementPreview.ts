import { getVacatingForBooking, listElectricityInvoicesForBooking, type ElectricityInvoiceRow } from '@/src/db/queries/customer';
import { firstOfMonth } from '@/src/services/billing';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
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

function outstandingElectricityPaise(inv: ElectricityInvoiceRow): number {
  const projected = projectElectricityInvoice({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    electricityBillId: inv.electricityBillId,
    roomId: inv.roomId,
    bookingId: inv.bookingId,
    customerId: '',
    bedId: '',
    billingMonth: inv.billingMonth,
    dueDate: inv.dueDate,
    amountPaise: inv.amountPaise,
    paidPaise: inv.paidPaise,
    lateFeeLockedPaise: inv.lateFeeLockedPaise,
    status: inv.status,
    paymentId: null,
    paidAt: inv.paidAt,
    paymentProofUrl: null,
    unitsShare: null,
    activeDays: null,
    cancelledAt: null,
    supersededByInvoiceId: null,
    duplicateDetectedAt: null,
    isPipelineTest: false,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
  });
  if (projected.outstandingPaise <= 0) return 0;
  if (
    projected.effectiveStatus === 'pending' ||
    projected.effectiveStatus === 'overdue'
  ) {
    return projected.outstandingPaise;
  }
  return 0;
}

/**
 * Resident-facing settlement preview before refund request.
 * Auto-includes outstanding electricity when the checkout-month bill exists.
 */
export async function getDepositRefundSettlementPreview(
  bookingId: string,
): Promise<DepositRefundSettlementPreview> {
  const depositSummary = await getDepositSummaryForBooking(bookingId);
  const depositBalancePaise = Math.max(0, depositSummary?.refundableBalancePaise ?? 0);

  const elecRes = await listElectricityInvoicesForBooking(bookingId);
  if (!elecRes.ok) {
    return {
      depositBalancePaise,
      electricityAdjustmentPaise: null,
      refundAmountPaise: null,
      electricityPending: true,
      electricityBillingMonth: null,
    };
  }

  let electricityAdjustmentPaise = 0;
  let electricityBillingMonth: string | null = null;

  for (const inv of elecRes.data) {
    if (inv.status === 'cancelled') continue;
    const outstanding = outstandingElectricityPaise(inv);
    if (outstanding > 0) {
      electricityAdjustmentPaise += outstanding;
      electricityBillingMonth = String(inv.billingMonth).slice(0, 7);
    }
  }

  if (electricityAdjustmentPaise > 0) {
    return {
      depositBalancePaise,
      electricityAdjustmentPaise,
      refundAmountPaise: Math.max(0, depositBalancePaise - electricityAdjustmentPaise),
      electricityPending: false,
      electricityBillingMonth,
    };
  }

  const vacatingRes = await getVacatingForBooking(bookingId);
  const vacatingDate =
    vacatingRes.ok && vacatingRes.data ? vacatingRes.data.vacatingDate : null;
  if (vacatingDate) {
    const checkoutMonth = firstOfMonth(vacatingDate);
    const hasCheckoutMonthBill = elecRes.data.some(
      (inv) =>
        inv.status !== 'cancelled' && firstOfMonth(String(inv.billingMonth)) === checkoutMonth,
    );
    if (!hasCheckoutMonthBill) {
      return {
        depositBalancePaise,
        electricityAdjustmentPaise: null,
        refundAmountPaise: null,
        electricityPending: true,
        electricityBillingMonth: checkoutMonth.slice(0, 7),
      };
    }
  }

  return {
    depositBalancePaise,
    electricityAdjustmentPaise: 0,
    refundAmountPaise: depositBalancePaise,
    electricityPending: false,
    electricityBillingMonth: null,
  };
}
