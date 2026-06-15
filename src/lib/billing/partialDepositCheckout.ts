/** Half of a standard 2-month security deposit (one month upfront). */
export function oneMonthDepositPaise(depositPaise: number, rentSubtotalPaise: number): number | null {
  if (depositPaise <= 0 || rentSubtotalPaise <= 0) return null;
  const half = Math.floor(depositPaise / 2);
  if (half <= 0 || half >= depositPaise) return null;
  // Offer when deposit is at least one month's rent (typical 2× monthly deposit).
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
