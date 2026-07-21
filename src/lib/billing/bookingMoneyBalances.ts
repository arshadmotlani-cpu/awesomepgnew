/**
 * Client-safe booking money balance types and pure allocation math.
 */

export type MoneyBalanceSlice = {
  requiredPaise: number;
  receivedPaise: number;
  outstandingPaise: number;
};

export type BookingMoneyBalances = {
  bookingId: string;
  rent: MoneyBalanceSlice;
  deposit: MoneyBalanceSlice & { refundablePaise: number };
};

export type PaymentAllocationInput = {
  confirmedReceivedPaise: number;
  rentAllocatedPaise: number;
  depositAllocatedPaise: number;
};

export function computeMoneySlice(requiredPaise: number, receivedPaise: number): MoneyBalanceSlice {
  const required = Math.max(0, requiredPaise);
  const received = Math.max(0, receivedPaise);
  return {
    requiredPaise: required,
    receivedPaise: received,
    outstandingPaise: Math.max(0, required - received),
  };
}

export function unallocatedPaymentPaise(allocation: PaymentAllocationInput): number {
  return Math.max(
    0,
    allocation.confirmedReceivedPaise -
      allocation.rentAllocatedPaise -
      allocation.depositAllocatedPaise,
  );
}

export type ValidatePaymentAllocationArgs = {
  allocation: PaymentAllocationInput;
  rentOutstandingBeforePaise: number;
  depositOutstandingBeforePaise: number;
  /** When true, allow rent allocation above current outstanding (prepay). */
  allowRentPrepay?: boolean;
};

export function validatePaymentAllocation(
  args: ValidatePaymentAllocationArgs,
): { ok: true } | { ok: false; reason: string } {
  const { allocation } = args;
  if (allocation.confirmedReceivedPaise < 0) {
    return { ok: false, reason: 'Confirmed received amount cannot be negative.' };
  }
  if (allocation.rentAllocatedPaise < 0 || allocation.depositAllocatedPaise < 0) {
    return { ok: false, reason: 'Rent and deposit allocations cannot be negative.' };
  }
  const totalAllocated =
    allocation.rentAllocatedPaise + allocation.depositAllocatedPaise;
  if (totalAllocated > allocation.confirmedReceivedPaise) {
    return {
      ok: false,
      reason: 'Rent plus deposit allocation cannot exceed confirmed received amount.',
    };
  }
  if (!args.allowRentPrepay && allocation.rentAllocatedPaise > args.rentOutstandingBeforePaise) {
    return {
      ok: false,
      reason: `Rent allocation exceeds outstanding rent (₹${(args.rentOutstandingBeforePaise / 100).toFixed(0)}).`,
    };
  }
  if (allocation.depositAllocatedPaise > args.depositOutstandingBeforePaise) {
    return {
      ok: false,
      reason: `Deposit allocation exceeds outstanding deposit (₹${(args.depositOutstandingBeforePaise / 100).toFixed(0)}).`,
    };
  }
  return { ok: true };
}
