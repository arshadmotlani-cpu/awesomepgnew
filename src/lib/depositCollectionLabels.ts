import type { DepositCollectionStatus } from '@/src/db/schema/enums';

export function labelDepositCollectionStatus(status: DepositCollectionStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'full':
      return 'Paid';
    case 'partial':
      return 'Partial';
    case 'overdue':
      return 'Overdue';
    case 'waived':
      return 'Adjusted';
    default:
      return status;
  }
}

/** Rich deposit status for management tables (refund/adjustment overlays). */
export function resolveDepositDisplayStatus(row: {
  depositCollectionStatus: DepositCollectionStatus;
  depositDuePaise: number;
  collectedPaise: number;
  refundedPaise: number;
  hasRefundRequest?: boolean;
  hasManualAdjustment?: boolean;
}): string {
  if (row.refundedPaise > 0 && row.collectedPaise <= row.refundedPaise) return 'Refunded';
  if (row.hasRefundRequest) return 'Refund requested';
  if (row.hasManualAdjustment) return 'Adjusted';
  if (row.depositCollectionStatus === 'full' || (row.depositDuePaise <= 0 && row.collectedPaise > 0)) {
    return 'Paid';
  }
  if (row.depositCollectionStatus === 'partial' || row.depositDuePaise > 0) {
    return row.depositDuePaise > 0 ? 'Partial' : 'Paid';
  }
  return labelDepositCollectionStatus(row.depositCollectionStatus);
}

export function hasOutstandingDepositDue(booking: {
  depositCollectionStatus: DepositCollectionStatus;
  depositDuePaise: number;
}): boolean {
  return (
    (booking.depositCollectionStatus === 'partial' ||
      booking.depositCollectionStatus === 'overdue') &&
    booking.depositDuePaise > 0
  );
}
