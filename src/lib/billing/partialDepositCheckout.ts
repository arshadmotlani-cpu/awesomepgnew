/** Half of a standard 2-month security deposit (one month upfront). */
export function oneMonthDepositPaise(depositPaise: number, rentSubtotalPaise: number): number | null {
  if (depositPaise <= 0 || rentSubtotalPaise <= 0) return null;
  const half = Math.floor(depositPaise / 2);
  if (half <= 0 || half >= depositPaise) return null;
  // Offer when deposit is at least half of first month's rent (2-week deposit on monthly stay).
  if (depositPaise < rentSubtotalPaise) return null;
  return half;
}

export function checkoutTotalWithOneMonthDeposit(
  fullTotalPaise: number,
  depositPaise: number,
  oneMonthPaise: number,
): number {
  return fullTotalPaise - depositPaise + oneMonthPaise;
}
