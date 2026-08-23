import type { PlatformSubscriptionStatus } from '@/src/platform/db/schema';

/** Map Stripe subscription.status → PlatformSubscriptionStatus (British cancelled). */
export function mapStripeSubscriptionStatus(
  stripeStatus: string | null | undefined,
): PlatformSubscriptionStatus {
  switch (stripeStatus) {
    case 'trialing':
      return 'trial';
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'unpaid':
      return 'unpaid';
    case 'incomplete':
      return 'incomplete';
    case 'incomplete_expired':
      return 'cancelled';
    case 'canceled':
    case 'cancelled':
      return 'cancelled';
    case 'paused':
      return 'suspended';
    default:
      return 'incomplete';
  }
}
