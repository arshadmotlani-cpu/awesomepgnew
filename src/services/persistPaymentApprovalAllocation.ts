import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  electricityInvoices,
  paymentLinks,
  pgPaymentRecords,
  rentInvoices,
  stayExtensions,
} from '@/src/db/schema';
import { recordPaymentApprovalAllocation } from '@/src/services/paymentApprovalAllocations';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { getQrBookingPaymentReview } from '@/src/services/qrPayments';

/**
 * After a successful approve, persist the allocation snapshot from live entity data.
 * Failures are logged but do not roll back the financial approval.
 */
export async function persistApprovalAllocationAfterSuccess(input: {
  kind: PendingPaymentReviewItem['kind'];
  entityId: string;
  pgId: string;
  approvedByAdminId: string;
  adminAllocation?: {
    confirmedReceivedPaise: number;
    rentAllocatedPaise: number;
    depositAllocatedPaise: number;
    allocationNotes?: string;
  };
}): Promise<void> {
  try {
    const item = await buildMinimalReviewItemForAllocation(input);
    if (!item) return;
    await recordPaymentApprovalAllocation({
      item,
      approvedByAdminId: input.approvedByAdminId,
      adminAllocation: input.adminAllocation,
    });
  } catch (err) {
    console.error('[payment-approval-allocation] persist failed', {
      kind: input.kind,
      entityId: input.entityId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

async function buildMinimalReviewItemForAllocation(input: {
  kind: PendingPaymentReviewItem['kind'];
  entityId: string;
  pgId: string;
}): Promise<PendingPaymentReviewItem | null> {
  const base = {
    key: `${input.kind}:${input.entityId}`,
    kind: input.kind,
    pgId: input.pgId,
    pgName: '',
    residentName: '',
    phone: null,
    bookingCode: null,
    roomNumber: null,
    bedCode: null,
    paymentTypeLabel: '',
    title: '',
    subtitle: '',
    screenshotUrl: '',
    entityId: input.entityId,
    customerId: null as string | null,
    bookingId: null as string | null,
    expectedLines: [] as PendingPaymentReviewItem['expectedLines'],
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary: null,
    canPartialApprove: false,
    canReject: false,
  };

  if (input.kind === 'qr') {
    const [record] = await db
      .select()
      .from(pgPaymentRecords)
      .where(eq(pgPaymentRecords.id, input.entityId))
      .limit(1);
    if (!record) return null;
    const review = record.bookingId
      ? await getQrBookingPaymentReview(record.id)
      : null;
    return {
      ...base,
      paymentTypeLabel: 'Booking / Deposit payment',
      amountPaise: record.amountPaise,
      expectedTotalPaise: review?.bookingTotalDuePaise ?? record.amountPaise,
      receivedPaise: review?.amountSubmittedPaise ?? record.amountPaise,
      submittedAmountPaise: review?.amountSubmittedPaise ?? record.amountPaise,
      customerId: record.customerId,
      bookingId: record.bookingId,
      bookingPaymentReview: review ?? undefined,
      lifecycleState: record.bookingId ? 'reservation_request' : 'payment_collection',
    };
  }

  if (input.kind === 'rent') {
    const [row] = await db
      .select()
      .from(rentInvoices)
      .where(eq(rentInvoices.id, input.entityId))
      .limit(1);
    if (!row) return null;
    const amount =
      row.proofSnapshotOutstandingPaise ??
      Math.max(0, row.rentPaise - (row.discountPaise ?? 0));
    return {
      ...base,
      paymentTypeLabel: 'Rent',
      amountPaise: amount,
      expectedTotalPaise: amount,
      receivedPaise: amount,
      submittedAmountPaise: amount,
      invoiceAmountPaise: amount,
      customerId: row.customerId,
      bookingId: row.bookingId,
    };
  }

  if (input.kind === 'electricity') {
    const [row] = await db
      .select()
      .from(electricityInvoices)
      .where(eq(electricityInvoices.id, input.entityId))
      .limit(1);
    if (!row) return null;
    return {
      ...base,
      paymentTypeLabel: 'Electricity',
      amountPaise: row.amountPaise,
      expectedTotalPaise: row.amountPaise,
      receivedPaise: row.amountPaise,
      submittedAmountPaise: row.amountPaise,
      invoiceAmountPaise: row.amountPaise,
      customerId: row.customerId,
      bookingId: row.bookingId,
    };
  }

  if (input.kind === 'extension') {
    const [row] = await db
      .select()
      .from(stayExtensions)
      .where(eq(stayExtensions.id, input.entityId))
      .limit(1);
    if (!row) return null;
    return {
      ...base,
      paymentTypeLabel: 'Stay extension',
      amountPaise: row.quotedTotalPaise,
      expectedTotalPaise: row.quotedTotalPaise,
      receivedPaise: row.quotedTotalPaise,
      bookingId: row.bookingId,
    };
  }

  if (input.kind === 'deposit_link') {
    const [row] = await db
      .select()
      .from(paymentLinks)
      .where(eq(paymentLinks.id, input.entityId))
      .limit(1);
    if (!row) return null;
    return {
      ...base,
      paymentTypeLabel: 'Deposit',
      amountPaise: row.amount,
      expectedTotalPaise: row.amount,
      receivedPaise: row.amount,
      customerId: row.residentId,
      bookingId: row.bookingId,
    };
  }

  return null;
}
