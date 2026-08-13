import type { WorkforceIncentivePlanInput } from '@/src/workforce/types/hr';
import { SALON_INCENTIVE_RULES } from '@/src/workforce/lib/salonCompensationRules.constants';
import {
  DEFAULT_FLAT_PRODUCT_RULE,
  DEFAULT_FLAT_SERVICE_RULE,
  defaultSalonRulesConfig,
  describeIncentiveRules,
  migrateLegacyThresholdConfig,
  normalizeIncentivePlan,
} from '@/src/workforce/lib/incentiveRuleEngine';
import type {
  PercentageThresholdIncentiveConfig,
  SalonRulesIncentiveConfig,
} from '@/src/workforce/types/hr';

export { SALON_PAYROLL_RULES, SALON_INCENTIVE_RULES } from '@/src/workforce/lib/salonCompensationRules.constants';

/** Build default per-employee plan (flat 5% service + flat 5% product). */
export function buildDefaultIncentivePlan(enabled: boolean): WorkforceIncentivePlanInput {
  if (!enabled) {
    return { planType: 'none', config: {}, effectiveFrom: null };
  }
  const config = defaultSalonRulesConfig();
  return { planType: 'salon_rules', effectiveFrom: null, config };
}

/**
 * @deprecated Use buildDefaultIncentivePlan — kept for backward-compatible tests.
 * Legacy 2× salary threshold plan; new employees should use configurable rules.
 */
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

/** Short summary from a stored or legacy plan config. */
export function salonIncentiveRuleSummary(
  planType?: string,
  config?: unknown,
): string {
  const normalized = planType && config
    ? normalizeIncentivePlan(planType as 'salon_rules', config as SalonRulesIncentiveConfig)
    : null;
  if (!normalized) {
    const below = SALON_INCENTIVE_RULES.belowThresholdPercentBps / 100;
    const product = SALON_INCENTIVE_RULES.productSalesPercentBps / 100;
    return `Service: flat ${below}% (default). Products: flat ${product}%.`;
  }
  const parts: string[] = [];
  if (normalized.serviceEnabled) {
    parts.push(`Service: ${describeIncentiveRules(normalized.serviceRules, 'service')[0]}`);
  }
  if (normalized.productEnabled) {
    parts.push(`Products: ${describeIncentiveRules(normalized.productRules, 'product')[0]}`);
  }
  return parts.join(' ') || 'Incentive disabled.';
}

/** Full rule explanation for UI from stored plan or defaults. */
export function salonIncentiveRulesDisplay(
  planType?: string,
  config?: unknown,
): {
  servicePerformance: string[];
  productSales: string[];
} {
  const normalized = planType && config
    ? normalizeIncentivePlan(planType as 'salon_rules', config as SalonRulesIncentiveConfig)
    : null;

  if (!normalized) {
    return {
      servicePerformance: describeIncentiveRules([DEFAULT_FLAT_SERVICE_RULE], 'service'),
      productSales: describeIncentiveRules([DEFAULT_FLAT_PRODUCT_RULE], 'product'),
    };
  }

  return {
    servicePerformance: normalized.serviceEnabled
      ? describeIncentiveRules(normalized.serviceRules, 'service')
      : ['Service incentive disabled.'],
    productSales: normalized.productEnabled
      ? describeIncentiveRules(normalized.productRules, 'product')
      : ['Product incentive disabled.'],
  };
}

/** Display helper for legacy percentage_threshold configs. */
export function legacyThresholdRulesDisplay(
  config: PercentageThresholdIncentiveConfig,
): { servicePerformance: string[]; productSales: string[] } {
  const migrated = migrateLegacyThresholdConfig(config);
  return {
    servicePerformance: describeIncentiveRules(migrated.serviceRules, 'service'),
    productSales: describeIncentiveRules(migrated.productRules, 'product'),
  };
}
