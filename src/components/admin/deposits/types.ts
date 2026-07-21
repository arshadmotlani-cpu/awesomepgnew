import type { DepositCollectionStatus } from '@/src/db/schema/enums';

export type DepositTableRow = {
  bookingId: string;
  bookingCode: string;
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  /** Required deposit from rent plan. */
  requiredPaise: number;
  collectedPaise: number;
  deductionsPaise: number;
  refundablePaise: number;
  invoiceStatus: 'collecting' | 'held' | 'refund_pending' | 'settled';
  displayStatus: string;
  isSettled: boolean;
  isFrozen: boolean;
  /** Legacy fields */
  depositPaise: number;
  depositDuePaise: number;
  depositCollectionStatus: DepositCollectionStatus;
  deductedPaise: number;
  refundedPaise: number;
  refundableBalancePaise: number;
};
