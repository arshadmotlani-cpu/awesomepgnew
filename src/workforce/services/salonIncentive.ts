/**
 * Salon incentive from attributed sales — wires Hair attribution SSOT to Workforce incentive math.
 */
import { getStaffPerformanceSummary } from '@/src/hair/services/staffPerformance';
import { zonedLocalToUtc } from '@/src/hair/lib/salonTime';
import { computeIncentiveFromRules } from '@/src/workforce/lib/incentiveRuleEngine';
import {
  isIncentivePlanActive,
  isPercentageThresholdConfig,
  normalizeIncentivePlan,
} from '@/src/workforce/lib/incentiveRuleEngine';
import { thresholdPaiseFromConfig } from '@/src/workforce/lib/incentivePlanMath';
import { getIncentivePlan } from '@/src/workforce/services/incentivePlans';
import type { PercentageThresholdIncentiveConfig, SalonRulesIncentiveConfig } from '@/src/workforce/types/hr';
import type { WorkforceEngineId } from '@/src/workforce/types';

export type SalonPeriodIncentiveResult = {
  periodStart: string;
  periodEnd: string;
  servicePerformancePaise: number;
  productSalesPaise: number;
  serviceIncentivePaise: number;
  productIncentivePaise: number;
  totalIncentivePaise: number;
  thresholdPaise: number;
  incentiveEnabled: boolean;
};

export function payrollPeriodToDateRange(
  periodStart: string,
  periodEnd: string,
  timezone = 'Asia/Kolkata',
): { from: Date; to: Date } {
  const from = zonedLocalToUtc(`${periodStart}T00:00:00`, timezone);
  const [y, m, d] = periodEnd.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextKey = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  const to = zonedLocalToUtc(`${nextKey}T00:00:00`, timezone);
  return { from, to };
}

/** Compute incentive from attributed service + product sales for a payroll period. */
export async function computeSalonPeriodIncentive(input: {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  engineId?: WorkforceEngineId;
  timezone?: string;
}): Promise<SalonPeriodIncentiveResult> {
  const engineId = input.engineId ?? 'fyh_salon';
  const timezone = input.timezone ?? 'Asia/Kolkata';
  const plan = await getIncentivePlan(input.employeeId, engineId);

  const empty: SalonPeriodIncentiveResult = {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    servicePerformancePaise: 0,
    productSalesPaise: 0,
    serviceIncentivePaise: 0,
    productIncentivePaise: 0,
    totalIncentivePaise: 0,
    thresholdPaise: 0,
    incentiveEnabled: false,
  };

  if (!plan || !isIncentivePlanActive(plan.planType, plan.config)) {
    return empty;
  }

  const normalized = normalizeIncentivePlan(plan.planType, plan.config);
  if (!normalized) {
    return empty;
  }

  const { from, to } = payrollPeriodToDateRange(input.periodStart, input.periodEnd, timezone);
  const perf = await getStaffPerformanceSummary(input.employeeId, { from, to });

  const servicePerformancePaise = perf.serviceRevenuePaise;
  const productSalesPaise = perf.productRevenuePaise;

  const serviceIncentivePaise = normalized.serviceEnabled
    ? computeIncentiveFromRules(servicePerformancePaise, normalized.serviceRules)
    : 0;
  const productIncentivePaise = normalized.productEnabled
    ? computeIncentiveFromRules(productSalesPaise, normalized.productRules)
    : 0;
  const totalIncentivePaise = serviceIncentivePaise + productIncentivePaise;

  let thresholdPaise = 0;
  if (isPercentageThresholdConfig(plan.planType, plan.config)) {
    thresholdPaise = thresholdPaiseFromConfig(plan.config as PercentageThresholdIncentiveConfig);
  } else if (normalized.serviceRules.length > 1) {
    thresholdPaise = normalized.serviceRules[1]!.thresholdPaise;
  }

  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    servicePerformancePaise,
    productSalesPaise,
    serviceIncentivePaise,
    productIncentivePaise,
    totalIncentivePaise,
    thresholdPaise,
    incentiveEnabled: normalized.serviceEnabled || normalized.productEnabled,
  };
}

/** Pure calculation when performance totals are already known (tests / previews). */
export function computeSalonIncentiveFromTotals(
  config: SalonRulesIncentiveConfig | PercentageThresholdIncentiveConfig,
  servicePerformancePaise: number,
  productSalesPaise: number,
  planType: 'salon_rules' | 'percentage_threshold' = 'salon_rules',
): {
  serviceIncentivePaise: number;
  productIncentivePaise: number;
  totalIncentivePaise: number;
} {
  const normalized = normalizeIncentivePlan(planType, config);
  if (!normalized) {
    return { serviceIncentivePaise: 0, productIncentivePaise: 0, totalIncentivePaise: 0 };
  }

  const serviceIncentivePaise = normalized.serviceEnabled
    ? computeIncentiveFromRules(servicePerformancePaise, normalized.serviceRules)
    : 0;
  const productIncentivePaise = normalized.productEnabled
    ? computeIncentiveFromRules(productSalesPaise, normalized.productRules)
    : 0;

  return {
    serviceIncentivePaise,
    productIncentivePaise,
    totalIncentivePaise: serviceIncentivePaise + productIncentivePaise,
  };
}
