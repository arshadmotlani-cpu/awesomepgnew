/**
 * Rotating investment pool — wealth only grows through profit.
 *
 * Selling a vehicle converts an asset back into cash; it does NOT create wealth.
 * Returned capital must never be added on top of initial capital.
 *
 * Working Capital (total owned) = Initial Capital + My Profit
 * Current Investment            = money locked in unsold vehicles
 * Free Cash                     = Working Capital − Current Investment − Capital in Transit
 *
 * Capital in transit = outstanding recovery on sold (not yet settled) vehicles.
 * Lifetime Purchase Volume is historical activity only — never used for cash.
 */

export function computeWorkingCapitalPool(input: {
  /** Seed capital injected into the pool (not reduced by vehicle sales). */
  initialCapitalPaise: number;
  /** My profit after partner share (accrued closed deals + manual). */
  myProfitPaise: number;
  /** Money tied up in active (unsold) vehicles. */
  currentInvestmentPaise: number;
  /**
   * Capital still outstanding on sold vehicles (awaiting collection).
   * Not free cash — not available for the next purchase.
   */
  capitalInTransitPaise?: number;
}): {
  workingCapitalPaise: number;
  currentInvestmentPaise: number;
  capitalInTransitPaise: number;
  freeCashPaise: number;
} {
  const initial = Math.max(0, Math.round(input.initialCapitalPaise));
  const profit = Math.round(input.myProfitPaise);
  const currentInvestmentPaise = Math.max(0, Math.round(input.currentInvestmentPaise));
  const capitalInTransitPaise = Math.max(0, Math.round(input.capitalInTransitPaise ?? 0));

  const workingCapitalPaise = initial + profit;
  const freeCashPaise = workingCapitalPaise - currentInvestmentPaise - capitalInTransitPaise;

  return {
    workingCapitalPaise,
    currentInvestmentPaise,
    capitalInTransitPaise,
    freeCashPaise,
  };
}
