/**
 * HR profile types — salary, payment, week-off, incentive plans.
 * Extensible: new incentive plan types add a config variant + evaluator.
 */

export const WORKFORCE_SALARY_FREQUENCIES = ['monthly', 'weekly', 'daily'] as const;
export type WorkforceSalaryFrequency = (typeof WORKFORCE_SALARY_FREQUENCIES)[number];

export const WORKFORCE_PAYMENT_METHODS = ['bank_transfer', 'upi'] as const;
export type WorkforcePaymentMethod = (typeof WORKFORCE_PAYMENT_METHODS)[number];

export const WORKFORCE_INCENTIVE_PLAN_TYPES = [
  'none',
  /** @deprecated Legacy — normalized to salon_rules at read time. */
  'percentage_threshold',
  'salon_rules',
  'fixed_bonus',
] as const;
export type WorkforceIncentivePlanType = (typeof WORKFORCE_INCENTIVE_PLAN_TYPES)[number];

/** 0=Sunday … 6=Saturday — matches wf_schedules.day_of_week */
export const WORKFORCE_WEEKDAY_LABELS: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export const WORKFORCE_WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export type PercentageThresholdIncentiveConfig = {
  baseSalaryPaise: number;
  thresholdMultiplier: number;
  /** Service performance at or below threshold — default 5%. */
  belowThresholdPercentBps?: number;
  /** Service performance above threshold — 10% on entire amount. */
  aboveThresholdPercentBps: number;
};

export type FixedBonusIncentiveConfig = {
  bonusPaise: number;
};

/** One performance threshold → percentage rule (threshold switch, not tiered). */
export type SalonIncentiveRule = {
  /** Performance at or above this amount (paise). Use 0 for the base / flat rule. */
  thresholdPaise: number;
  /** Incentive rate in basis points (500 = 5%). */
  percentBps: number;
};

/** Per-employee configurable service + product incentive rules. */
export type SalonRulesIncentiveConfig = {
  serviceEnabled: boolean;
  productEnabled: boolean;
  serviceRules: SalonIncentiveRule[];
  productRules: SalonIncentiveRule[];
};

export type WorkforceIncentivePlanConfig =
  | Record<string, never>
  | PercentageThresholdIncentiveConfig
  | SalonRulesIncentiveConfig
  | FixedBonusIncentiveConfig;

export type WorkforceIncentivePlanInput = {
  planType: WorkforceIncentivePlanType;
  config: WorkforceIncentivePlanConfig;
  effectiveFrom?: string | null;
};
