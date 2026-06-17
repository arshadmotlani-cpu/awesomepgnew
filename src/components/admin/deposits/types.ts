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
  depositPaise: number;
  depositDuePaise: number;
  depositCollectionStatus: 'pending' | 'full' | 'partial' | 'overdue' | 'waived';
  collectedPaise: number;
  deductedPaise: number;
  refundedPaise: number;
  refundableBalancePaise: number;
};
