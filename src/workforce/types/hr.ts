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
  'percentage_threshold',
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
  aboveThresholdPercentBps: number;
};

export type FixedBonusIncentiveConfig = {
  bonusPaise: number;
};

export type WorkforceIncentivePlanConfig =
  | Record<string, never>
  | PercentageThresholdIncentiveConfig
  | FixedBonusIncentiveConfig;

export type WorkforceIncentivePlanInput = {
  planType: WorkforceIncentivePlanType;
  config: WorkforceIncentivePlanConfig;
  effectiveFrom?: string | null;
};
