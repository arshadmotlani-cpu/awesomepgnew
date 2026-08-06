/** Fixed salon compensation rules — SSOT for payroll cycle and incentive math. */
export const SALON_PAYROLL_RULES = {
  generationStartDay: 7,
  generationEndDay: 10,
  periodMode: 'previous_calendar_month' as const,
};

export const SALON_INCENTIVE_RULES = {
  thresholdMultiplier: 2,
  aboveThresholdPercentBps: 1000, // 10%
};
