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
  electricity: MoneyBalanceSlice;
};

export type PaymentAllocationInput = {
  confirmedReceivedPaise: number;
  rentAllocatedPaise: number;
  depositAllocatedPaise: number;
  electricityAllocatedPaise: number;
  otherAllocatedPaise: number;
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

export function totalAllocatedPaise(allocation: PaymentAllocationInput): number {
  return (
    allocation.rentAllocatedPaise +
    allocation.depositAllocatedPaise +
    allocation.electricityAllocatedPaise +
    allocation.otherAllocatedPaise
  );
}

export function unallocatedPaymentPaise(allocation: PaymentAllocationInput): number {
  return Math.max(0, allocation.confirmedReceivedPaise - totalAllocatedPaise(allocation));
}

export type ValidatePaymentAllocationArgs = {
  allocation: PaymentAllocationInput;
  rentOutstandingBeforePaise: number;
  depositOutstandingBeforePaise: number;
  electricityOutstandingBeforePaise?: number;
  /** When true, allow rent allocation above current outstanding (prepay). */
  allowRentPrepay?: boolean;
};

/** Suggested split for a standard booking payment — rent first, then deposit, then electricity. */
export function suggestPaymentAllocation(input: {
  confirmedReceivedPaise: number;
  rentOutstandingPaise: number;
  depositOutstandingPaise: number;
  electricityOutstandingPaise?: number;
}): PaymentAllocationInput {
  let remaining = Math.max(0, input.confirmedReceivedPaise);
  const rentAllocated = Math.min(remaining, Math.max(0, input.rentOutstandingPaise));
  remaining -= rentAllocated;
  const depositAllocated = Math.min(remaining, Math.max(0, input.depositOutstandingPaise));
  remaining -= depositAllocated;
  const electricityOutstanding = Math.max(0, input.electricityOutstandingPaise ?? 0);
  const electricityAllocated = Math.min(remaining, electricityOutstanding);
  remaining -= electricityAllocated;

  return {
    confirmedReceivedPaise: input.confirmedReceivedPaise,
    rentAllocatedPaise: rentAllocated,
    depositAllocatedPaise: depositAllocated,
    electricityAllocatedPaise: electricityAllocated,
    otherAllocatedPaise: 0,
  };
}

export function validatePaymentAllocation(
  args: ValidatePaymentAllocationArgs,
): { ok: true } | { ok: false; reason: string } {
  const { allocation } = args;
  if (allocation.confirmedReceivedPaise < 0) {
    return { ok: false, reason: 'Confirmed received amount cannot be negative.' };
  }
  if (
    allocation.rentAllocatedPaise < 0 ||
    allocation.depositAllocatedPaise < 0 ||
    allocation.electricityAllocatedPaise < 0 ||
    allocation.otherAllocatedPaise < 0
  ) {
    return { ok: false, reason: 'Allocation amounts cannot be negative.' };
  }
  const totalAllocated = totalAllocatedPaise(allocation);
  if (totalAllocated > allocation.confirmedReceivedPaise) {
    return {
      ok: false,
      reason: 'Total allocation cannot exceed confirmed received amount.',
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
  const elecOutstanding = args.electricityOutstandingBeforePaise ?? 0;
  if (allocation.electricityAllocatedPaise > elecOutstanding) {
    return {
      ok: false,
      reason: `Electricity allocation exceeds outstanding (₹${(elecOutstanding / 100).toFixed(0)}).`,
    };
  }
  return { ok: true };
}
