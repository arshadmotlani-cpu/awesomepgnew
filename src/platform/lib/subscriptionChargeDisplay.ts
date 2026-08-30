import type { PlatformSubscriptionStatus } from '@/src/platform/db/schema';
import { formatInrFromPaise } from '@/src/platform/lib/salonSubscriptionPricing';
import { isComplimentarySubscriptionStatus } from '@/src/platform/lib/subscriptionTrial';

export type SubscriptionChargeInput = {
  status: PlatformSubscriptionStatus | null | undefined;
  amountPaise?: number | null;
};

/** Human-readable annual SaaS charge — complimentary orgs are always ₹0 with no invoices. */
export function formatSubscriptionAnnualCharge(input: SubscriptionChargeInput): string {
  if (isComplimentarySubscriptionStatus(input.status)) {
    return '₹0 / year';
  }
  if (input.amountPaise != null && input.amountPaise > 0) {
    return `${formatInrFromPaise(input.amountPaise)} / year`;
  }
  return '—';
}

export function subscriptionAnnualChargePaise(input: SubscriptionChargeInput): number | null {
  if (isComplimentarySubscriptionStatus(input.status)) return 0;
  if (input.amountPaise != null && input.amountPaise > 0) return input.amountPaise;
  return null;
}
