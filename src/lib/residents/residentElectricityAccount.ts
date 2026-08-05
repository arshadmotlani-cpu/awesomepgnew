/**
 * Resident Brain — electricity account SSOT per booking.
 * Combines invoice projection + deposit deductions + waiver state.
 */
import { listElectricityInvoicesForBooking } from '@/src/db/queries/customer';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { db } from '@/src/db/client';
import { depositLedger } from '@/src/db/schema';
import { and, eq } from 'drizzle-orm';

export type ResidentElectricityAccountSnapshot = {
  bookingId: string;
  electricityDuePaise: number;
  electricityPaidPaise: number;
  electricityDeductedFromDepositPaise: number;
  electricityWaivedPaise: number;
  lateFeePaise: number;
  lateFeeWaived: boolean;
  netOutstandingPaise: number;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    billingMonth: string;
    amountPaise: number;
    paidPaise: number;
    outstandingPaise: number;
    lateFeePaise: number;
    lateFeeWaived: boolean;
    status: string;
  }>;
};

async function sumElectricityDepositDeductions(bookingId: string): Promise<number> {
  const rows = await db
    .select({ amountPaise: depositLedger.amountPaise })
    .from(depositLedger)
    .where(
      and(
        eq(depositLedger.bookingId, bookingId),
        eq(depositLedger.deductionCategory, 'electricity'),
      ),
    );
  return rows.reduce((sum, r) => sum + Math.abs(Number(r.amountPaise)), 0);
}

export async function buildResidentElectricityAccount(
  bookingId: string,
): Promise<ResidentElectricityAccountSnapshot> {
  const elecRes = await listElectricityInvoicesForBooking(bookingId);
  const invoices = elecRes.ok ? elecRes.data : [];

  let electricityDuePaise = 0;
  let electricityPaidPaise = 0;
  let lateFeePaise = 0;
  let lateFeeWaived = false;
  let electricityWaivedPaise = 0;

  const invoiceRows = invoices
    .filter((inv) => inv.status !== 'cancelled')
    .map((inv) => {
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
        paymentId: inv.paymentId ?? null,
        paidAt: inv.paidAt,
        paymentProofUrl: inv.paymentProofUrl,
        unitsShare: inv.unitsShare,
        activeDays: inv.activeDays,
        cancelledAt: null,
        supersededByInvoiceId: null,
        duplicateDetectedAt: null,
        isPipelineTest: false,
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
        lateFeeWaived: (inv as { lateFeeWaived?: boolean }).lateFeeWaived ?? false,
      });

      const invLateFeeWaived = (inv as { lateFeeWaived?: boolean }).lateFeeWaived === true;
      if (invLateFeeWaived) lateFeeWaived = true;

      electricityDuePaise += inv.amountPaise;
      electricityPaidPaise += inv.paidPaise;
      lateFeePaise += projected.accruedLateFeePaise;

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        billingMonth: String(inv.billingMonth),
        amountPaise: inv.amountPaise,
        paidPaise: inv.paidPaise,
        outstandingPaise: projected.outstandingPaise,
        lateFeePaise: projected.accruedLateFeePaise,
        lateFeeWaived: invLateFeeWaived,
        status: projected.effectiveStatus,
      };
    });

  const electricityDeductedFromDepositPaise = await sumElectricityDepositDeductions(bookingId);
  await getDepositSummaryForBooking(bookingId);

  const netOutstandingPaise = invoiceRows.reduce((sum, inv) => sum + inv.outstandingPaise, 0);

  return {
    bookingId,
    electricityDuePaise,
    electricityPaidPaise,
    electricityDeductedFromDepositPaise,
    electricityWaivedPaise,
    lateFeePaise,
    lateFeeWaived,
    netOutstandingPaise,
    invoices: invoiceRows,
  };
}
