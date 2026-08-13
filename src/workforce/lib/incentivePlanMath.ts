import type { PercentageThresholdIncentiveConfig } from '@/src/workforce/types/hr';
import {
  computeIncentiveFromRules,
  getApplicableIncentiveRateBps,
  migrateLegacyThresholdConfig,
  validateAndNormalizeRules,
} from '@/src/workforce/lib/incentiveRuleEngine';
import { SALON_INCENTIVE_RULES } from '@/src/workforce/lib/salonCompensationRules.constants';

export {
  computeIncentiveFromRules,
  getApplicableIncentiveRateBps,
  validateAndNormalizeRules,
} from '@/src/workforce/lib/incentiveRuleEngine';

export function thresholdPaiseFromConfig(config: PercentageThresholdIncentiveConfig): number {
  return Math.floor(
    Math.max(0, config.baseSalaryPaise) * Math.max(0, config.thresholdMultiplier),
  );
}

/**
 * Service performance incentive — uses normalized rules (legacy config migrated).
 * Threshold switch: highest matching threshold rate applies to entire performance.
 */
export function computeServicePerformanceIncentivePaise(
  config: PercentageThresholdIncentiveConfig,
  servicePerformancePaise: number,
): number {
  const migrated = migrateLegacyThresholdConfig(config);
  if (!migrated.serviceEnabled) return 0;
  return computeIncentiveFromRules(servicePerformancePaise, migrated.serviceRules);
}

/** Product sales incentive — uses normalized rules (legacy: flat 5%). */
export function computeProductSalesIncentivePaise(
  productSalesPaise: number,
  productPercentBps = SALON_INCENTIVE_RULES.productSalesPercentBps,
): number {
  return computeIncentiveFromRules(productSalesPaise, [
    { thresholdPaise: 0, percentBps: productPercentBps },
  ]);
}

/** Total salon incentive from service performance + product sales (separate calculations). */
export function computeSalonIncentivePaise(
  config: PercentageThresholdIncentiveConfig,
  servicePerformancePaise: number,
  productSalesPaise: number,
): number {
  return (
    computeServicePerformanceIncentivePaise(config, servicePerformancePaise) +
    computeProductSalesIncentivePaise(productSalesPaise)
  );
}

/**
 * @deprecated Use computeIncentiveFromRules — kept for legacy callers during migration.
 */
export function computePercentageThresholdIncentivePaise(
  config: PercentageThresholdIncentiveConfig,
  businessPaise: number,
): number {
  return computeServicePerformanceIncentivePaise(config, businessPaise);
}
