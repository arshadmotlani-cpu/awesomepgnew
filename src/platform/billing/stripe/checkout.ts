import { and, eq } from 'drizzle-orm';
import {
  platformMemberships,
  platformOrganizationSubscriptions,
  platformOrganizations,
  platformPlans,
  platformUsers,
} from '@/src/platform/db/schema';
import { createPlatformClient } from '@/src/platform/db/client';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';
import { getPlatformStripe, resolveStripePriceId } from './client';

export type CreateCheckoutSessionInput = {
  organizationId: string;
  planId?: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
};

export type CreateCheckoutSessionResult = {
  checkoutUrl: string;
  sessionId: string;
};

export async function createCheckoutSession(
  input: CreateCheckoutSessionInput,
): Promise<CreateCheckoutSessionResult> {
  if (!hasPlatformDatabaseUrl()) throw new Error('Platform database is not configured');
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [org] = await db
      .select({ id: platformOrganizations.id, name: platformOrganizations.name })
      .from(platformOrganizations)
      .where(eq(platformOrganizations.id, input.organizationId))
      .limit(1);
    if (!org) throw new Error('Organization not found');

    const [subscription] = await db
      .select()
      .from(platformOrganizationSubscriptions)
      .where(eq(platformOrganizationSubscriptions.organizationId, input.organizationId))
      .limit(1);
    if (!subscription) throw new Error('Organization subscription not found');

    const planId = input.planId ?? subscription.planId;
    const [plan] = await db.select().from(platformPlans).where(eq(platformPlans.id, planId)).limit(1);
    if (!plan) throw new Error('Plan not found');

    let email = input.customerEmail?.trim().toLowerCase() || null;
    if (!email) {
      const [owner] = await db
        .select({ email: platformUsers.email })
        .from(platformMemberships)
        .innerJoin(platformUsers, eq(platformMemberships.userId, platformUsers.id))
        .where(
          and(
            eq(platformMemberships.organizationId, input.organizationId),
            eq(platformMemberships.isActive, true),
          ),
        )
        .limit(1);
      email = owner?.email ?? null;
    }

    const stripe = getPlatformStripe();
    const priceId = resolveStripePriceId(plan.limits as Record<string, unknown>);

    let customerId = subscription.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email ?? undefined,
        name: org.name,
        metadata: { organizationId: org.id, platform: 'fyh_saas' },
      });
      customerId = customer.id;
      await db
        .update(platformOrganizationSubscriptions)
        .set({
          stripeCustomerId: customerId,
          stripePriceId: priceId,
          planId,
          status: 'incomplete',
          updatedAt: new Date(),
        })
        .where(eq(platformOrganizationSubscriptions.id, subscription.id));
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: org.id,
      metadata: { organizationId: org.id, planId, subscriptionId: subscription.id },
      subscription_data: {
        metadata: { organizationId: org.id, planId, subscriptionId: subscription.id },
      },
    });
    if (!session.url) throw new Error('Stripe Checkout session missing URL');
    return { checkoutUrl: session.url, sessionId: session.id };
  } finally {
    await close();
  }
}
