/**
 * Canonical rent liability through a selected move-out date.
 *
 * SSOT inputs: BillingCoverageModel.tailRentPaise (unpaid/partial boundary)
 * and prepaidAfterVacatingPaise (paid unused days → wallet credit).
 * Do not derive "rent through" as monthly − outstanding.
 */

export type CanonicalRentThroughMoveOutScenario = 'unpaid' | 'paid' | 'partial' | 'none';

export type CanonicalRentThroughMoveOut = {
  scenario: CanonicalRentThroughMoveOutScenario;
  monthlyRentPaise: number;
  paidPaise: number;
  /** Exact rent owed for occupancy through the move-out date. */
  rentThroughVacatingPaise: number;
  /** max(0, through − paid) — payable in settlement / Bills Due after reconcile. */
  remainingRentLiabilityPaise: number;
  /** Unused prepaid after move-out (wallet credit path). */
  unusedPrepaidRentPaise: number;
  /** Amount still due for rent in final settlement (same as remaining liability). */
  finalRentSettlementPaise: number;
};

/**
 * Resolve one canonical rent-through-move-out view for resident preview,
 * admin billing, and settlement alignment.
 */
export function resolveCanonicalRentThroughMoveOut(input: {
  monthlyRentPaise: number;
  paidPrincipalPaise: number;
  /** BCM tail — chargeable rent through vacate when the final period is unpaid. */
  tailRentPaise: number;
  /** BCM / waterfall unused prepaid after vacate. */
  prepaidAfterVacatingPaise: number;
}): CanonicalRentThroughMoveOut {
  const monthlyRentPaise = Math.max(0, input.monthlyRentPaise);
  const paidPaise = Math.max(0, input.paidPrincipalPaise);
  const tailRentPaise = Math.max(0, input.tailRentPaise);
  const prepaidAfterVacatingPaise = Math.max(0, input.prepaidAfterVacatingPaise);

  if (monthlyRentPaise <= 0) {
    return {
      scenario: 'none',
      monthlyRentPaise: 0,
      paidPaise,
      rentThroughVacatingPaise: 0,
      remainingRentLiabilityPaise: 0,
      unusedPrepaidRentPaise: 0,
      finalRentSettlementPaise: 0,
    };
  }

  // Fully paid month: preserve payment; unused prepaid → wallet credit.
  // Do not re-derive liability from unpaid-tail math when the month is already paid.
  if (paidPaise > 0 && paidPaise >= monthlyRentPaise) {
    const rentThroughVacatingPaise = Math.max(0, monthlyRentPaise - prepaidAfterVacatingPaise);
    return {
      scenario: 'paid',
      monthlyRentPaise,
      paidPaise,
      rentThroughVacatingPaise,
      remainingRentLiabilityPaise: 0,
      unusedPrepaidRentPaise: prepaidAfterVacatingPaise,
      finalRentSettlementPaise: 0,
    };
  }

  // Unpaid / partial final period: move-out boundary = tail charge.
  if (tailRentPaise > 0) {
    const remainingRentLiabilityPaise = Math.max(0, tailRentPaise - paidPaise);
    const unusedFromOverpay = Math.max(0, paidPaise - tailRentPaise);
    const unusedPrepaidRentPaise = Math.max(prepaidAfterVacatingPaise, unusedFromOverpay);
    const scenario: CanonicalRentThroughMoveOutScenario =
      paidPaise <= 0 ? 'unpaid' : remainingRentLiabilityPaise > 0 ? 'partial' : 'paid';

    return {
      scenario,
      monthlyRentPaise,
      paidPaise,
      rentThroughVacatingPaise: tailRentPaise,
      remainingRentLiabilityPaise,
      unusedPrepaidRentPaise,
      finalRentSettlementPaise: remainingRentLiabilityPaise,
    };
  }

  // Paid coverage through vacate without a full-month face (edge): consumed = monthly − unused.
  if (prepaidAfterVacatingPaise > 0 || paidPaise > 0) {
    const rentThroughVacatingPaise = Math.max(0, monthlyRentPaise - prepaidAfterVacatingPaise);
    const scenario: CanonicalRentThroughMoveOutScenario =
      paidPaise >= monthlyRentPaise ? 'paid' : paidPaise > 0 ? 'partial' : 'none';
    return {
      scenario,
      monthlyRentPaise,
      paidPaise,
      rentThroughVacatingPaise,
      remainingRentLiabilityPaise: 0,
      unusedPrepaidRentPaise: prepaidAfterVacatingPaise,
      finalRentSettlementPaise: 0,
    };
  }

  return {
    scenario: 'none',
    monthlyRentPaise,
    paidPaise,
    rentThroughVacatingPaise: 0,
    remainingRentLiabilityPaise: 0,
    unusedPrepaidRentPaise: 0,
    finalRentSettlementPaise: 0,
  };
}

/**
 * When an unpaid full-month invoice has not yet been adjusted, Bills Due /
 * waterfall outstanding must not exceed the canonical move-out liability.
 */
export function canonicalOutstandingRentLiabilityPaise(input: {
  invoiceOutstandingPaise: number;
  paidPrincipalPaise: number;
  tailRentPaise: number;
}): number {
  const invoiceOutstanding = Math.max(0, input.invoiceOutstandingPaise);
  const paid = Math.max(0, input.paidPrincipalPaise);
  const tail = Math.max(0, input.tailRentPaise);
  if (tail <= 0) return invoiceOutstanding;
  const throughLiability = Math.max(0, tail - paid);
  return Math.min(invoiceOutstanding, throughLiability);
}
