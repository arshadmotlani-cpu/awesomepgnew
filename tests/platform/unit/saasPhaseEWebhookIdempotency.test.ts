import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { eq } from 'drizzle-orm';
import { createPlatformClient } from '@/src/platform/db/client';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';
import {
  platformBillingWebhookEvents,
  platformOrganizationSubscriptions,
  platformOrganizations,
  platformPlans,
} from '@/src/platform/db/schema';
import {
  __testOnlyDeleteWebhookEvent,
  applyStripeEventToSubscriptions,
} from '@/src/platform/billing/stripe/webhook';
import { isSubscriptionAccessAllowed } from '@/src/platform/services/memberships';

test('E5 webhook replay same event.id is idempotent no-op', async (t) => {
  if (!hasPlatformDatabaseUrl()) {
    t.skip('PLATFORM_DATABASE_URL not set');
    return;
  }

  const { db, close } = createPlatformClient({ max: 1 });
  let orgId: string | null = null;
  const eventId = `evt_phase_e_${Date.now()}`;
  try {
    const [plan] = await db.select({ id: platformPlans.id }).from(platformPlans).limit(1);
    if (!plan) {
      t.skip('No platform plan row');
      return;
    }

    const [org] = await db
      .insert(platformOrganizations)
      .values({
        slug: `phase-e-${Date.now()}`,
        name: 'Phase E Test Org',
        status: 'trial',
      })
      .returning({ id: platformOrganizations.id });
    orgId = org!.id;

    await db.insert(platformOrganizationSubscriptions).values({
      organizationId: orgId,
      planId: plan.id,
      status: 'incomplete',
    });

    const payload = {
      id: eventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: orgId,
          metadata: { organizationId: orgId },
          subscription: 'sub_test_phase_e',
          customer: 'cus_test_phase_e',
        },
      },
    };

    const first = await applyStripeEventToSubscriptions(payload);
    assert.equal(first.duplicate, false);

    const [sub1] = await db
      .select({
        status: platformOrganizationSubscriptions.status,
        stripeSubscriptionId: platformOrganizationSubscriptions.stripeSubscriptionId,
      })
      .from(platformOrganizationSubscriptions)
      .where(eq(platformOrganizationSubscriptions.organizationId, orgId))
      .limit(1);
    assert.equal(sub1?.status, 'active');
    assert.equal(sub1?.stripeSubscriptionId, 'sub_test_phase_e');

    const second = await applyStripeEventToSubscriptions(payload);
    assert.equal(second.duplicate, true);

    const [events] = await db
      .select({ eventId: platformBillingWebhookEvents.eventId })
      .from(platformBillingWebhookEvents)
      .where(eq(platformBillingWebhookEvents.eventId, eventId))
      .limit(1);
    assert.equal(events?.eventId, eventId);

    const cancelId = `${eventId}_cancel`;
    await applyStripeEventToSubscriptions({
      id: cancelId,
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_test_phase_e',
          status: 'canceled',
          metadata: { organizationId: orgId },
          customer: 'cus_test_phase_e',
        },
      },
    });
    const [sub2] = await db
      .select({ status: platformOrganizationSubscriptions.status })
      .from(platformOrganizationSubscriptions)
      .where(eq(platformOrganizationSubscriptions.organizationId, orgId))
      .limit(1);
    assert.equal(sub2?.status, 'cancelled');
    assert.equal(isSubscriptionAccessAllowed(sub2?.status), false);

    await __testOnlyDeleteWebhookEvent(eventId);
    await __testOnlyDeleteWebhookEvent(cancelId);
  } finally {
    if (orgId) {
      await db
        .delete(platformOrganizationSubscriptions)
        .where(eq(platformOrganizationSubscriptions.organizationId, orgId));
      await db.delete(platformOrganizations).where(eq(platformOrganizations.id, orgId));
    }
    await close();
  }
});
