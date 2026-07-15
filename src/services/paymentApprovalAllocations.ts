import { db } from '@/src/db/client';
import { paymentApprovalAllocations } from '@/src/db/schema';
import {
  allocationSnapshotForApproval,
  buildPaymentReviewBreakdown,
} from '@/src/lib/operations/paymentReviewBreakdown';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

export type PaymentApprovalEntityType =
  | 'pg_payment_record'
  | 'rent_invoice'
  | 'electricity_invoice'
  | 'stay_extension'
  | 'payment_link';

const KIND_TO_ENTITY: Record<PendingPaymentReviewItem['kind'], PaymentApprovalEntityType> = {
  qr: 'pg_payment_record',
  rent: 'rent_invoice',
  electricity: 'electricity_invoice',
  extension: 'stay_extension',
  deposit_link: 'payment_link',
};

export function entityTypeForReviewKind(
  kind: PendingPaymentReviewItem['kind'],
): PaymentApprovalEntityType {
  return KIND_TO_ENTITY[kind];
}

/**
 * Persist the room-charges / deposit allocation shown to the admin at approve time.
 * Idempotent per (entityType, entityId).
 */
export async function recordPaymentApprovalAllocation(input: {
  item: PendingPaymentReviewItem;
  approvedByAdminId: string;
}): Promise<void> {
  const snapshot = allocationSnapshotForApproval(input.item);
  const breakdown = buildPaymentReviewBreakdown(input.item);
  const entityType = entityTypeForReviewKind(input.item.kind);

  await db
    .insert(paymentApprovalAllocations)
    .values({
      entityType,
      entityId: input.item.entityId,
      bookingId: input.item.bookingId,
      customerId: input.item.customerId,
      pgId: input.item.pgId,
      roomChargesPaidPaise: snapshot.roomChargesPaidPaise,
      securityDepositPaidPaise: snapshot.securityDepositPaidPaise,
      priorOutstandingPaidPaise: breakdown.priorPaidPaise,
      totalAmountReceivedPaise: snapshot.totalAmountReceivedPaise,
      totalExpectedPaise: breakdown.totalExpectedPaise,
      paymentCategory: snapshot.paymentCategoryLabel,
      approvedByAdminId: input.approvedByAdminId,
      approvedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        paymentApprovalAllocations.entityType,
        paymentApprovalAllocations.entityId,
      ],
      set: {
        bookingId: input.item.bookingId,
        customerId: input.item.customerId,
        pgId: input.item.pgId,
        roomChargesPaidPaise: snapshot.roomChargesPaidPaise,
        securityDepositPaidPaise: snapshot.securityDepositPaidPaise,
        priorOutstandingPaidPaise: breakdown.priorPaidPaise,
        totalAmountReceivedPaise: snapshot.totalAmountReceivedPaise,
        totalExpectedPaise: breakdown.totalExpectedPaise,
        paymentCategory: snapshot.paymentCategoryLabel,
        approvedByAdminId: input.approvedByAdminId,
        approvedAt: new Date(),
      },
    });
}
