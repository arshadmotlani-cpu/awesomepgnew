/**
 * Resident move-out request — rent bill presentation (pure, no DB).
 * Consumes BillingCoverageModel + CheckoutSettlementWaterfall SSOT only.
 */
import type { BillingCoverageModel } from '@/src/lib/billing/billingCoverageModel';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import type { FinalPeriodRentInvoiceOutstanding } from '@/src/lib/checkout/checkoutSettlementV2Compute';
import { firstOfMonth } from '@/src/services/billing';
import { resolveCanonicalRentThroughMoveOut } from '@/src/lib/vacating/canonicalRentThroughMoveOut';

export type ResidentMoveOutRentScenario = 'unpaid' | 'paid' | 'partial' | 'none';

export type ResidentMoveOutRentSection = {
  scenario: ResidentMoveOutRentScenario;
  monthLabel: string;
  monthlyRentPaise: number;
  paidPaise: number;
  rentThroughVacatingPaise: number;
  unusedPrepaidRentPaise: number;
  remainingRentLiabilityPaise: number;
  finalRentSettlementPaise: number;
  headline: string;
  billingCycleNote: string;
};

function monthLabelFromVacatingDate(vacatingDate: string): string {
  const d = new Date(`${firstOfMonth(vacatingDate)}T12:00:00`);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function buildResidentMoveOutRentSection(input: {
  vacatingDate: string;
  monthlyRentPaise: number;
  coverage: BillingCoverageModel;
  waterfall: CheckoutSettlementWaterfall;
  finalPeriodInvoice: FinalPeriodRentInvoiceOutstanding;
}): ResidentMoveOutRentSection {
  const monthLabel = monthLabelFromVacatingDate(input.vacatingDate);
  // Monthly rent is the booking/cycle amount — never the post-proration invoice face.
  const monthlyRentPaise = Math.max(0, input.monthlyRentPaise);
  const paidPaise = Math.max(0, input.finalPeriodInvoice.paidPrincipalPaise);
  const unusedFromWaterfall = Math.max(
    0,
    input.waterfall.rentBucket.unusedPaise || input.coverage.prepaidAfterVacatingPaise,
  );

  const canonical = resolveCanonicalRentThroughMoveOut({
    monthlyRentPaise,
    paidPrincipalPaise: paidPaise,
    tailRentPaise: input.coverage.tailRentPaise,
    prepaidAfterVacatingPaise: unusedFromWaterfall,
  });

  const billingCycleNote = 'Rent is billed on the 1st of every month.';

  const headline =
    canonical.scenario === 'unpaid'
      ? `Your ${monthLabel} rent is currently unpaid. Your final rent will be adjusted to your valid move-out date.`
      : canonical.scenario === 'paid'
        ? `You have already paid ${monthLabel} rent. The unused amount after your move-out date will be credited to your wallet.`
        : canonical.scenario === 'partial'
          ? `Part of your ${monthLabel} rent is paid. The rest will be adjusted to your move-out date in final settlement.`
          : '';

  return {
    scenario: canonical.scenario,
    monthLabel,
    monthlyRentPaise: canonical.monthlyRentPaise,
    paidPaise: canonical.paidPaise,
    rentThroughVacatingPaise: canonical.rentThroughVacatingPaise,
    unusedPrepaidRentPaise: canonical.unusedPrepaidRentPaise,
    remainingRentLiabilityPaise: canonical.remainingRentLiabilityPaise,
    finalRentSettlementPaise: canonical.finalRentSettlementPaise,
    headline,
    billingCycleNote,
  };
}
