/**
 * Shared trial helpers for platform organization subscriptions.
 * Product "trial_start / trial_end" maps onto currentPeriodStart / currentPeriodEnd.
 */

export const TRIAL_LENGTH_DAYS = 30;

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
  subscriptionStatus: string;
  trialEndsAt?: string | null;
  now?: Date;
}): { currentPeriodStart: Date; currentPeriodEnd: Date | null } {
  const now = input.now ?? new Date();
  const override = parseOptionalDate(input.trialEndsAt);

  if (input.subscriptionStatus === 'trial') {
    const { start, end } = computeTrialPeriod(now);
    return {
      currentPeriodStart: start,
      currentPeriodEnd: override ?? end,
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
  status: string | null | undefined,
  currentPeriodEnd: Date | null | undefined,
  now: Date = new Date(),
): string | null {
  if (status !== 'trial') return null;
  if (!currentPeriodEnd) return 'Trial';
  if (!isTrialPeriodActive(currentPeriodEnd, now)) {
    return 'Trial expired - awaiting payment';
  }
  const days = trialDaysRemaining(currentPeriodEnd, now);
  return days === 1 ? '1 day left' : `${days} days left`;
}
