import type { PercentageThresholdIncentiveConfig } from '@/src/workforce/types/hr';
import { SALON_INCENTIVE_RULES } from '@/src/workforce/lib/salonCompensationRules.constants';

export function thresholdPaiseFromConfig(config: PercentageThresholdIncentiveConfig): number {
  return Math.floor(
    Math.max(0, config.baseSalaryPaise) * Math.max(0, config.thresholdMultiplier),
  );
}

/**
 * Service performance incentive — threshold switch (not progressive/tiered).
 * At or below 2× salary → 5% of total service performance.
 * Above 2× salary → 10% of total service performance.
 */
export function computeServicePerformanceIncentivePaise(
  config: PercentageThresholdIncentiveConfig,
  servicePerformancePaise: number,
): number {
  const performance = Math.max(0, Math.floor(servicePerformancePaise));
  if (performance === 0) return 0;

  const threshold = thresholdPaiseFromConfig(config);
  const belowBps =
    config.belowThresholdPercentBps ?? SALON_INCENTIVE_RULES.belowThresholdPercentBps;
  const aboveBps = config.aboveThresholdPercentBps;

  if (performance <= threshold) {
    return Math.floor((performance * Math.max(0, belowBps)) / 10_000);
  }
  return Math.floor((performance * Math.max(0, aboveBps)) / 10_000);
}

/** Product sales incentive — always 5% of attributed product sales. */
export function computeProductSalesIncentivePaise(
  productSalesPaise: number,
  productPercentBps = SALON_INCENTIVE_RULES.productSalesPercentBps,
): number {
  const sales = Math.max(0, Math.floor(productSalesPaise));
  if (sales === 0) return 0;
  return Math.floor((sales * Math.max(0, productPercentBps)) / 10_000);
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
 * @deprecated Use computeServicePerformanceIncentivePaise — kept for legacy callers during migration.
 * Previously computed progressive 10% above threshold only.
 */
export function computePercentageThresholdIncentivePaise(
  config: PercentageThresholdIncentiveConfig,
  businessPaise: number,
): number {
  return computeServicePerformanceIncentivePaise(config, businessPaise);
}
