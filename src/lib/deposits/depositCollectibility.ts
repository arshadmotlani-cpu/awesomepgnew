/**
 * SSOT — when a booking belongs in Deposit Due (required deposit > wallet balance).
 */

export function depositWalletBalancePaise(collectedPaise: number): number {
  return Math.max(0, collectedPaise);
}

export function depositRemainingDuePaise(requiredPaise: number, walletBalancePaise: number): number {
  return Math.max(0, requiredPaise - Math.max(0, walletBalancePaise));
}

/** Booking requires deposit collection — wallet has not reached required amount. */
export function isDepositDue(requiredPaise: number, walletBalancePaise: number): boolean {
  if (requiredPaise <= 0) return false;
  return depositRemainingDuePaise(requiredPaise, walletBalancePaise) > 0;
}
