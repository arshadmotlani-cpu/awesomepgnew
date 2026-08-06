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
      aboveThresholdPercentBps: SALON_INCENTIVE_RULES.aboveThresholdPercentBps,
    },
  };
}

/** Human-readable summary for UI helper text. */
export function salonIncentiveRuleSummary(): string {
  const pct = SALON_INCENTIVE_RULES.aboveThresholdPercentBps / 100;
  const mult = SALON_INCENTIVE_RULES.thresholdMultiplier;
  return `Salon rule: ${pct}% of business above ${mult}× base salary`;
}
