import type { PercentageThresholdIncentiveConfig } from '@/src/workforce/types/hr';

/** Business above threshold × percent → incentive (paise). */
export function computePercentageThresholdIncentivePaise(
  config: PercentageThresholdIncentiveConfig,
  businessPaise: number,
): number {
  const business = Math.max(0, Math.floor(businessPaise));
  const base = Math.max(0, Math.floor(config.baseSalaryPaise));
  const multiplier = Math.max(0, config.thresholdMultiplier);
  const threshold = Math.floor(base * multiplier);
  const extra = Math.max(0, business - threshold);
  const bps = Math.max(0, Math.floor(config.aboveThresholdPercentBps));
  return Math.floor((extra * bps) / 10_000);
}

export function thresholdPaiseFromConfig(config: PercentageThresholdIncentiveConfig): number {
  return Math.floor(
    Math.max(0, config.baseSalaryPaise) * Math.max(0, config.thresholdMultiplier),
  );
}
