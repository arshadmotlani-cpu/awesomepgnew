import type { WorkforceIncentivePlanInput } from '@/src/workforce/types/hr';
import { SALON_INCENTIVE_RULES } from '@/src/workforce/lib/salonCompensationRules.constants';

export { SALON_PAYROLL_RULES, SALON_INCENTIVE_RULES } from '@/src/workforce/lib/salonCompensationRules.constants';

/** Build per-employee incentive plan using global salon constants. */
export function buildIncentivePlanFromSalary(
  salaryPaise: number,
  enabled: boolean,
): WorkforceIncentivePlanInput {
  if (!enabled || salaryPaise <= 0) {
    return { planType: 'none', config: {}, effectiveFrom: null };
  }
  return {
    planType: 'percentage_threshold',
    effectiveFrom: null,
    config: {
      baseSalaryPaise: salaryPaise,
      thresholdMultiplier: SALON_INCENTIVE_RULES.thresholdMultiplier,
      belowThresholdPercentBps: SALON_INCENTIVE_RULES.belowThresholdPercentBps,
      aboveThresholdPercentBps: SALON_INCENTIVE_RULES.aboveThresholdPercentBps,
    },
  };
}

/** Short summary for compact UI hints. */
export function salonIncentiveRuleSummary(): string {
  const below = SALON_INCENTIVE_RULES.belowThresholdPercentBps / 100;
  const above = SALON_INCENTIVE_RULES.aboveThresholdPercentBps / 100;
  const product = SALON_INCENTIVE_RULES.productSalesPercentBps / 100;
  const mult = SALON_INCENTIVE_RULES.thresholdMultiplier;
  return `Service: ${below}% up to ${mult}× salary, then ${above}% on total performance. Products: ${product}% always.`;
}

/** Full rule explanation for Salary & Incentives section. */
export function salonIncentiveRulesDisplay(): {
  servicePerformance: string[];
  productSales: string[];
} {
  const mult = SALON_INCENTIVE_RULES.thresholdMultiplier;
  const below = SALON_INCENTIVE_RULES.belowThresholdPercentBps / 100;
  const above = SALON_INCENTIVE_RULES.aboveThresholdPercentBps / 100;
  const product = SALON_INCENTIVE_RULES.productSalesPercentBps / 100;
  return {
    servicePerformance: [
      `At or below ${mult}× base salary → ${below}% of total service performance`,
      `Above ${mult}× base salary → ${above}% of total service performance (entire amount)`,
    ],
    productSales: [
      `Always → ${product}% of product sales attributed to the employee`,
      'Product sales do not count toward the service performance threshold',
    ],
  };
}
