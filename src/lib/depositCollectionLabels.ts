import type { DepositCollectionStatus } from '@/src/db/schema/enums';

export function labelDepositCollectionStatus(status: DepositCollectionStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'full':
      return 'Paid in full';
    case 'partial':
      return 'Partially paid';
    case 'overdue':
      return 'Overdue';
    case 'waived':
      return 'Waived';
    default:
      return status;
  }
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
