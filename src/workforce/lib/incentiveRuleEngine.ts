import { SALON_INCENTIVE_RULES } from '@/src/workforce/lib/salonCompensationRules.constants';
import type {
  PercentageThresholdIncentiveConfig,
  SalonIncentiveRule,
  SalonRulesIncentiveConfig,
  WorkforceIncentivePlanConfig,
  WorkforceIncentivePlanType,
} from '@/src/workforce/types/hr';

export const DEFAULT_FLAT_SERVICE_RULE: SalonIncentiveRule = {
  thresholdPaise: 0,
  percentBps: SALON_INCENTIVE_RULES.belowThresholdPercentBps,
};

export const DEFAULT_FLAT_PRODUCT_RULE: SalonIncentiveRule = {
  thresholdPaise: 0,
  percentBps: SALON_INCENTIVE_RULES.productSalesPercentBps,
};

export function isSalonRulesConfig(config: unknown): config is SalonRulesIncentiveConfig {
  return (
    typeof config === 'object' &&
    config !== null &&
    'serviceRules' in config &&
    'productRules' in config &&
    Array.isArray((config as SalonRulesIncentiveConfig).serviceRules)
  );
}

export function isPercentageThresholdConfig(
  planType: WorkforceIncentivePlanType,
  config: unknown,
): config is PercentageThresholdIncentiveConfig {
  return (
    planType === 'percentage_threshold' &&
    typeof config === 'object' &&
    config !== null &&
    'thresholdMultiplier' in config
  );
}

/** Convert legacy 2× salary plan into configurable rules. */
export function migrateLegacyThresholdConfig(
  config: PercentageThresholdIncentiveConfig,
): SalonRulesIncentiveConfig {
  const thresholdPaise = Math.floor(
    Math.max(0, config.baseSalaryPaise) * Math.max(0, config.thresholdMultiplier),
  );
  const belowBps = config.belowThresholdPercentBps ?? SALON_INCENTIVE_RULES.belowThresholdPercentBps;
  const rules: SalonIncentiveRule[] = [{ thresholdPaise: 0, percentBps: belowBps }];
  if (thresholdPaise > 0 && config.aboveThresholdPercentBps !== belowBps) {
    rules.push({ thresholdPaise, percentBps: config.aboveThresholdPercentBps });
  } else if (thresholdPaise > 0) {
    rules.push({ thresholdPaise, percentBps: config.aboveThresholdPercentBps });
  }
  return {
    serviceEnabled: true,
    productEnabled: true,
    serviceRules: rules,
    productRules: [DEFAULT_FLAT_PRODUCT_RULE],
  };
}

/** Normalize any stored plan into salon_rules config for calculation / UI. */
export function normalizeIncentivePlan(
  planType: WorkforceIncentivePlanType,
  config: WorkforceIncentivePlanConfig,
): SalonRulesIncentiveConfig | null {
  if (planType === 'none') return null;
  if (planType === 'salon_rules' && isSalonRulesConfig(config)) {
    return {
      serviceEnabled: config.serviceEnabled,
      productEnabled: config.productEnabled,
      serviceRules: validateAndNormalizeRules(config.serviceRules),
      productRules: validateAndNormalizeRules(config.productRules),
    };
  }
  if (isPercentageThresholdConfig(planType, config)) {
    return migrateLegacyThresholdConfig(config);
  }
  return null;
}

export function isIncentivePlanActive(
  planType: WorkforceIncentivePlanType,
  config: WorkforceIncentivePlanConfig,
): boolean {
  if (planType === 'none') return false;
  const normalized = normalizeIncentivePlan(planType, config);
  if (!normalized) return planType === 'percentage_threshold';
  return normalized.serviceEnabled || normalized.productEnabled;
}

/** Validate, dedupe, and sort rules ascending by threshold. */
export function validateAndNormalizeRules(rules: SalonIncentiveRule[]): SalonIncentiveRule[] {
  if (rules.length === 0) {
    throw new Error('At least one incentive rule is required.');
  }

  const normalized = rules.map((rule) => {
    const thresholdPaise = Math.max(0, Math.floor(rule.thresholdPaise));
    const percentBps = Math.max(0, Math.min(10_000, Math.floor(rule.percentBps)));
    if (!Number.isFinite(thresholdPaise) || !Number.isFinite(percentBps)) {
      throw new Error('Invalid incentive rule values.');
    }
    return { thresholdPaise, percentBps };
  });

  const seen = new Set<number>();
  for (const rule of normalized) {
    if (seen.has(rule.thresholdPaise)) {
      throw new Error('Duplicate performance thresholds are not allowed.');
    }
    seen.add(rule.thresholdPaise);
  }

  normalized.sort((a, b) => a.thresholdPaise - b.thresholdPaise);

  if (normalized[0]!.thresholdPaise !== 0) {
    throw new Error('The first rule must start at zero (flat / base rate).');
  }

  return normalized;
}

/**
 * Find the applicable rate for a performance amount (threshold switch).
 * Returns basis points for the highest threshold <= performance.
 */
export function getApplicableIncentiveRateBps(
  performancePaise: number,
  rules: SalonIncentiveRule[],
): number {
  const performance = Math.max(0, Math.floor(performancePaise));
  if (performance === 0 || rules.length === 0) return 0;

  const sorted = validateAndNormalizeRules(rules);
  let applicable = sorted[0]!.percentBps;
  for (const rule of sorted) {
    if (performance >= rule.thresholdPaise) {
      applicable = rule.percentBps;
    }
  }
  return applicable;
}

/** Apply the matching rule percentage to the ENTIRE performance amount. */
export function computeIncentiveFromRules(
  performancePaise: number,
  rules: SalonIncentiveRule[],
): number {
  const performance = Math.max(0, Math.floor(performancePaise));
  if (performance === 0) return 0;
  const bps = getApplicableIncentiveRateBps(performance, rules);
  return Math.floor((performance * bps) / 10_000);
}

export function formatInrFromPaiseRule(thresholdPaise: number): string {
  return `₹${Math.round(thresholdPaise / 100).toLocaleString('en-IN')}`;
}

/** Plain-language explanation for owners. */
export function describeIncentiveRules(
  rules: SalonIncentiveRule[],
  kind: 'service' | 'product',
): string[] {
  const sorted = validateAndNormalizeRules(rules);
  const label = kind === 'service' ? 'service performance' : 'product sales';

  if (sorted.length === 1) {
    const pct = sorted[0]!.percentBps / 100;
    return [`Flat ${pct}% on all eligible ${label}.`];
  }

  const lines: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const rule = sorted[i]!;
    const pct = rule.percentBps / 100;
    const next = sorted[i + 1];
    if (i === 0 && next) {
      lines.push(
        `Below ${formatInrFromPaiseRule(next.thresholdPaise)} → ${pct}% of total ${label}.`,
      );
    } else if (!next) {
      lines.push(
        `${formatInrFromPaiseRule(rule.thresholdPaise)} and above → ${pct}% of total ${label}.`,
      );
    }
  }
  return lines;
}

export function defaultSalonRulesConfig(): SalonRulesIncentiveConfig {
  return {
    serviceEnabled: true,
    productEnabled: true,
    serviceRules: [DEFAULT_FLAT_SERVICE_RULE],
    productRules: [DEFAULT_FLAT_PRODUCT_RULE],
  };
}
