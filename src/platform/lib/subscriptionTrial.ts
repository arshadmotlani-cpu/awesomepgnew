/**
 * Shared trial helpers for platform organization subscriptions.
 * Product "trial_start / trial_end" maps onto currentPeriodStart / currentPeriodEnd.
 */

import {
  PLATFORM_SUBSCRIPTION_STATUSES,
  type PlatformSubscriptionStatus,
} from '@/src/platform/db/schema';

export const TRIAL_LENGTH_DAYS = 30;

export function asPlatformSubscriptionStatus(
  value: string | null | undefined,
): PlatformSubscriptionStatus {
  if (
    typeof value === 'string' &&
    (PLATFORM_SUBSCRIPTION_STATUSES as readonly string[]).includes(value)
  ) {
    return value as PlatformSubscriptionStatus;
  }
  throw new Error(
    `subscriptionStatus is required (expected one of: ${PLATFORM_SUBSCRIPTION_STATUSES.join(', ')})`,
  );
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeTrialPeriod(now: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const start = new Date(now.getTime());
  const end = new Date(now.getTime());
  end.setDate(end.getDate() + TRIAL_LENGTH_DAYS);
  return { start, end };
}

function parseOptionalDate(raw: string | null | undefined): Date | null {
  if (!raw || !String(raw).trim()) return null;
  const parsed = new Date(String(raw).trim());
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function resolveCreateSubscriptionPeriod(input: {
  subscriptionStatus: PlatformSubscriptionStatus | null | undefined;
  trialEndsAt?: string | null;
  now?: Date;
}): { currentPeriodStart: Date; currentPeriodEnd: Date | null } {
  const now = input.now ?? new Date();
  const override = parseOptionalDate(input.trialEndsAt);
  const status: PlatformSubscriptionStatus = input.subscriptionStatus ?? 'trial';

  if (status === 'trial') {
    const { start, end } = computeTrialPeriod(now);
    return {
      currentPeriodStart: start,
      currentPeriodEnd: override ?? end,
    };
  }

  if (status === 'complimentary') {
    return {
      currentPeriodStart: now,
      currentPeriodEnd: null,
    };
  }

  return {
    currentPeriodStart: now,
    currentPeriodEnd: override,
  };
}

/**
 * Legacy trial rows with no end date remain allowed until operators set one.
 */
export function isTrialPeriodActive(
  currentPeriodEnd: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!currentPeriodEnd) return true;
  return now.getTime() < currentPeriodEnd.getTime();
}

export function trialDaysRemaining(
  currentPeriodEnd: Date,
  now: Date = new Date(),
): number {
  return Math.max(0, Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / MS_PER_DAY));
}

export function formatTrialAdminLabel(
  status: PlatformSubscriptionStatus | null | undefined,
  currentPeriodEnd: Date | null | undefined,
  now: Date = new Date(),
): string | null {
  if (status === 'complimentary') return 'Complimentary — no billing';
  if (status !== 'trial') return null;
  if (!currentPeriodEnd) return 'Trial';
  if (!isTrialPeriodActive(currentPeriodEnd, now)) {
    return 'Trial expired - awaiting payment';
  }
  const days = trialDaysRemaining(currentPeriodEnd, now);
  return days === 1 ? '1 day left' : `${days} days left`;
}

export function isComplimentarySubscriptionStatus(
  status: PlatformSubscriptionStatus | null | undefined,
): boolean {
  return status === 'complimentary';
}
