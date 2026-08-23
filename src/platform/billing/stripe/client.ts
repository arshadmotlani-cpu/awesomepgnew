import Stripe from 'stripe';

let cached: Stripe | null = null;

export function getPlatformStripeSecretKey(): string | null {
  return process.env.PLATFORM_STRIPE_SECRET_KEY?.trim() || null;
}

export function getPlatformStripeWebhookSecret(): string {
  const secret = process.env.PLATFORM_STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error('PLATFORM_STRIPE_WEBHOOK_SECRET is not configured');
  return secret;
}

/** Platform SaaS Stripe client — PLATFORM_STRIPE_* keys only. */
export function getPlatformStripe(): Stripe {
  const key = getPlatformStripeSecretKey();
  if (!key) throw new Error('PLATFORM_STRIPE_SECRET_KEY is not configured');
  if (!cached) {
    cached = new Stripe(key, {
      apiVersion: '2026-07-29.dahlia',
      typescript: true,
    });
  }
  return cached;
}

export function resolveStripePriceId(planLimits?: Record<string, unknown> | null): string {
  const fromPlan =
    typeof planLimits?.stripePriceId === 'string' ? planLimits.stripePriceId.trim() : '';
  if (fromPlan) return fromPlan;
  const fromEnv = process.env.PLATFORM_STRIPE_PRICE_ID?.trim();
  if (fromEnv) return fromEnv;
  throw new Error('No Stripe price id (plan.limits.stripePriceId or PLATFORM_STRIPE_PRICE_ID)');
}

export { mapStripeSubscriptionStatus } from './statusMap';
