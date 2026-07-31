import type { ElectricityInvoiceRow } from '@/src/db/queries/customer';
import type { ElectricityBillCalculationBreakdown } from '@/src/lib/billing/electricityBillBreakdownTypes';
import type { ResidentElectricityHistoryItem } from '@/src/components/customer/account/resident/ResidentElectricityHistory';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { titleCase } from '@/src/lib/format';

export const RESIDENT_ELECTRICITY_PRO_RATA_EXPLANATION =
  'This electricity bill has been calculated based on your stay duration, occupancy during the billing cycle, and your allocated share of room electricity.';

export const RESIDENT_ELECTRICITY_EQUAL_SPLIT_EXPLANATION =
  'Split equally among active room occupants for the billing month.';

export function electricityUseProRataFromRow(row: ElectricityInvoiceRow): boolean {
  const breakdown = row.calculationBreakdown as ElectricityBillCalculationBreakdown | null;
  if (breakdown && typeof breakdown.useProRata === 'boolean') return breakdown.useProRata;
  return false;
}

export function residentElectricityCalcExplanation(row: ElectricityInvoiceRow): string {
  return electricityUseProRataFromRow(row)
    ? RESIDENT_ELECTRICITY_PRO_RATA_EXPLANATION
    : RESIDENT_ELECTRICITY_EQUAL_SPLIT_EXPLANATION;
}

export function buildResidentElectricityHistoryItems(
  rows: ElectricityInvoiceRow[],
  bedCodeByBookingId?: Map<string, string>,
): ResidentElectricityHistoryItem[] {
  return rows.map((e) => {
    const projected = projectElectricityInvoice({
      id: e.id,
      invoiceNumber: e.invoiceNumber,
      electricityBillId: e.electricityBillId,
      roomId: e.roomId,
      bookingId: e.bookingId,
      customerId: '',
      bedId: '',
      billingMonth: e.billingMonth,
      dueDate: e.dueDate,
      amountPaise: e.amountPaise,
      paidPaise: e.paidPaise,
      lateFeeLockedPaise: e.lateFeeLockedPaise,
      status: e.status,
      paymentId: null,
      paidAt: e.paidAt,
      paymentProofUrl: e.paymentProofUrl,
      unitsShare: e.unitsShare,
      activeDays: e.activeDays,
      cancelledAt: null,
      supersededByInvoiceId: null,
      duplicateDetectedAt: null,
      isPipelineTest: false,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    });

    const paidTotalPaise =
      e.status === 'paid'
        ? e.paidPaise + (e.lateFeeLockedPaise ?? 0)
        : e.paidPaise;

    return {
      id: e.id,
      invoiceNumber: e.invoiceNumber,
      billingMonth: e.billingMonth,
      roomNumber: e.roomNumber,
      bedCode: e.bedCode ?? bedCodeByBookingId?.get(e.bookingId) ?? '—',
      daysCharged: e.activeDays,
      unitsAllocated: e.unitsShare != null ? Number(e.unitsShare) : null,
      billAmountPaise: e.amountPaise + (projected.accruedLateFeePaise ?? 0),
      paidAmountPaise: paidTotalPaise,
      outstandingAmountPaise: projected.outstandingPaise,
      paidAt: e.paidAt,
      paymentStatus: titleCase(projected.effectiveStatus.replace(/_/g, ' ')),
      detailHref: `/account/resident/pay-electricity/${e.id}`,
    };
  });
}
