/** Fixed salon compensation rules — SSOT for payroll cycle and incentive math. */
export const SALON_PAYROLL_RULES = {
  generationStartDay: 7,
  generationEndDay: 10,
  periodMode: 'previous_calendar_month' as const,
};

export const SALON_INCENTIVE_RULES = {
  thresholdMultiplier: 2,
  /** Service performance at or below 2× base salary. */
  belowThresholdPercentBps: 500, // 5%
  /** Service performance above 2× base salary — applied to entire service performance. */
  aboveThresholdPercentBps: 1000, // 10%
  /** Product sales attributed to employee — always 5%, no threshold. */
  productSalesPercentBps: 500, // 5%
};
