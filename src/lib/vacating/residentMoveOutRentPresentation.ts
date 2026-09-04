/**
 * Resident move-out request — rent bill presentation (pure, no DB).
 * Consumes BillingCoverageModel + CheckoutSettlementWaterfall SSOT only.
 */
import type { BillingCoverageModel } from '@/src/lib/billing/billingCoverageModel';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import type { FinalPeriodRentInvoiceOutstanding } from '@/src/lib/checkout/checkoutSettlementV2Compute';
import { firstOfMonth } from '@/src/services/billing';

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
  const monthlyRentPaise =
    input.finalPeriodInvoice.rentPaise > 0
      ? input.finalPeriodInvoice.rentPaise
      : Math.max(0, input.monthlyRentPaise);
  const paidPaise = Math.max(0, input.finalPeriodInvoice.paidPrincipalPaise);
  const outstandingPaise = Math.max(
    0,
    input.waterfall.outstandingRentInvoicePaise ?? input.finalPeriodInvoice.outstandingPaise,
  );
  const unusedPrepaidRentPaise = Math.max(
    0,
    input.waterfall.rentBucket.unusedPaise || input.coverage.prepaidAfterVacatingPaise,
  );

  let scenario: ResidentMoveOutRentScenario = 'none';
  if (monthlyRentPaise <= 0) {
    scenario = 'none';
  } else if (paidPaise <= 0 && outstandingPaise > 0) {
    scenario = 'unpaid';
  } else if (paidPaise > 0 && outstandingPaise > 0) {
    scenario = 'partial';
  } else if (paidPaise >= monthlyRentPaise) {
    scenario = 'paid';
  } else if (paidPaise > 0) {
    scenario = 'partial';
  }

  const rentThroughVacatingPaise =
    scenario === 'unpaid' || scenario === 'partial'
      ? Math.max(0, monthlyRentPaise - outstandingPaise)
      : unusedPrepaidRentPaise > 0
        ? Math.max(0, monthlyRentPaise - unusedPrepaidRentPaise)
        : Math.min(input.waterfall.rentBucket.consumedPaise, monthlyRentPaise);

  const remainingRentLiabilityPaise = outstandingPaise;
  const finalRentSettlementPaise =
    scenario === 'unpaid' || scenario === 'partial' ? outstandingPaise : 0;

  const billingCycleNote = 'Rent is billed on the 1st of every month.';

  const headline =
    scenario === 'unpaid'
      ? `Your ${monthLabel} rent is currently unpaid. Your final rent will be adjusted to your valid move-out date.`
      : scenario === 'paid'
        ? `You have already paid ${monthLabel} rent. The unused amount after your move-out date will be credited to your wallet.`
        : scenario === 'partial'
          ? `Part of your ${monthLabel} rent is paid. The rest will be adjusted to your move-out date in final settlement.`
          : '';

  return {
    scenario,
    monthLabel,
    monthlyRentPaise,
    paidPaise,
    rentThroughVacatingPaise,
    unusedPrepaidRentPaise,
    remainingRentLiabilityPaise,
    finalRentSettlementPaise,
    headline,
    billingCycleNote,
  };
}
