/**
 * Deposit collection status for assigned residents.
 *
 * Required deposit comes from `bookings.deposit_paise` — snapshotted at booking /
 * bed assignment from bed pricing (not PG default at read time).
 */

export type DepositCollectionStatus = 'paid' | 'pending' | 'requirement_missing';

export function classifyDepositCollection(input: {
  requiredDepositPaise: number;
  depositDuePaise: number;
  paidAmountPaise: number;
}): DepositCollectionStatus {
  if (input.requiredDepositPaise <= 0) {
    return 'requirement_missing';
  }

  const outstanding = depositOutstandingPaise(input);
  if (outstanding > 0) return 'pending';
  if (input.paidAmountPaise >= input.requiredDepositPaise) return 'paid';
  return 'pending';
}

export function depositOutstandingPaise(input: {
  requiredDepositPaise: number;
  depositDuePaise: number;
  paidAmountPaise: number;
}): number {
  if (input.requiredDepositPaise <= 0) return 0;
  return Math.max(
    0,
    input.depositDuePaise > 0
      ? input.depositDuePaise
      : input.requiredDepositPaise - input.paidAmountPaise,
  );
}

export function depositStatusLabel(status: DepositCollectionStatus): string {
  switch (status) {
    case 'paid':
      return 'Deposit paid';
    case 'pending':
      return 'Deposit pending';
    case 'requirement_missing':
      return 'Deposit requirement missing';
  }
}
