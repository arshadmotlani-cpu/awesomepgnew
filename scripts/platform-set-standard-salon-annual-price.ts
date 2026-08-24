/* eslint-disable no-console */
/**
 * Idempotent: set standard salon plan limits to ₹6,500/year (list ₹15,000).
 * Updates fyhair-production and fyh-staging by slug when PLATFORM_DATABASE_URL is set.
 *
 *   npx tsx scripts/platform-set-standard-salon-annual-price.ts
 */
import { eq } from 'drizzle-orm';
import { createPlatformClient } from '@/src/platform/db/client';
import { platformPlans } from '@/src/platform/db/schema';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';
import {
  STANDARD_SALON_PLAN_SLUGS,
  standardSalonPlanLimits,
} from '@/src/platform/lib/salonSubscriptionPricing';

async function main() {
  if (!hasPlatformDatabaseUrl()) {
    throw new Error('PLATFORM_DATABASE_URL is not configured');
  }
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    for (const slug of STANDARD_SALON_PLAN_SLUGS) {
      const [plan] = await db
        .select()
        .from(platformPlans)
        .where(eq(platformPlans.slug, slug))
        .limit(1);
      if (!plan) {
        console.log(`skip ${slug} — plan not found`);
        continue;
      }
      const existing = (plan.limits as Record<string, unknown>) ?? {};
      const next = standardSalonPlanLimits(existing);
      await db
        .update(platformPlans)
        .set({ limits: next })
        .where(eq(platformPlans.id, plan.id));
      console.log(`✓ ${slug}: amountPaise=${next.amountPaise} listPricePaise=${next.listPricePaise} billingInterval=${next.billingInterval}`);
    }
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
