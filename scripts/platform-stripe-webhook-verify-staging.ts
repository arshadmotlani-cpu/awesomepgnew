/* eslint-disable no-console */
/**
 * Staging Platform DB: webhook idempotency + signed double-delivery.
 * Uses Stripe SDK generateTestHeaderString (same HMAC as Stripe CLI signed events).
 * Also drives a second delivery via Stripe CLI `stripe trigger` when logged in
 * (optional — HMAC path is authoritative for signature verification).
 *
 * Usage: npx tsx scripts/platform-stripe-webhook-verify-staging.ts
 */
import { requireStagingEnv } from '@/src/lib/db/loadStagingEnv';
requireStagingEnv();

import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { createPlatformClient } from '@/src/platform/db/client';
import {
  platformBillingWebhookEvents,
  platformOrganizationSubscriptions,
  platformOrganizations,
  platformPlans,
} from '@/src/platform/db/schema';
import {
  __testOnlyDeleteWebhookEvent,
  applyStripeEventToSubscriptions,
  constructStripeEvent,
  processStripeWebhookEvent,
} from '@/src/platform/billing/stripe/webhook';
import { isSubscriptionAccessAllowed } from '@/src/platform/services/memberships';

const WHSEC = process.env.PLATFORM_STRIPE_WEBHOOK_SECRET?.trim() || 'whsec_staging_verify_local';
const SK = process.env.PLATFORM_STRIPE_SECRET_KEY?.trim() || 'sk_test_staging_verify_local';

async function main() {
  process.env.PLATFORM_STRIPE_WEBHOOK_SECRET = WHSEC;
  process.env.PLATFORM_STRIPE_SECRET_KEY = SK;

  const { db, close } = createPlatformClient({ max: 1 });
  let orgId: string | null = null;
  const eventId = `evt_staging_verify_${Date.now()}`;
  const results: { name: string; ok: boolean; detail?: string }[] = [];

  const check = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`✓ ${name}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      results.push({ name, ok: false, detail });
      console.error(`✗ ${name}: ${detail}`);
    }
  };

  try {
    const [plan] = await db.select({ id: platformPlans.id }).from(platformPlans).limit(1);
    if (!plan) throw new Error('No platform.plans row on staging');

    await check('reject missing signature', async () => {
      assert.throws(() => constructStripeEvent('{}', null));
    });

    await check('reject invalid signature', async () => {
      assert.throws(() => constructStripeEvent('{"id":"x"}', 't=1,v1=bad'));
    });

    const [org] = await db
      .insert(platformOrganizations)
      .values({
        slug: `wh-verify-${Date.now()}`,
        name: 'Webhook Verify Org',
        status: 'trial',
      })
      .returning({ id: platformOrganizations.id });
    orgId = org!.id;

    await db.insert(platformOrganizationSubscriptions).values({
      organizationId: orgId,
      planId: plan.id,
      status: 'incomplete',
    });

    const payloadObj = {
      id: eventId,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: orgId,
          metadata: { organizationId: orgId },
          subscription: 'sub_staging_verify',
          customer: 'cus_staging_verify',
        },
      },
    };
    const payload = JSON.stringify(payloadObj);
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WHSEC,
    });

    await check('accept valid signature + first delivery activates', async () => {
      const event = constructStripeEvent(payload, header);
      const first = await processStripeWebhookEvent(event);
      assert.equal(first.ok, true);
      if (first.ok) assert.equal(first.duplicate, false);
      const [sub] = await db
        .select({ status: platformOrganizationSubscriptions.status })
        .from(platformOrganizationSubscriptions)
        .where(eq(platformOrganizationSubscriptions.organizationId, orgId!))
        .limit(1);
      assert.equal(sub?.status, 'active');
      assert.equal(isSubscriptionAccessAllowed(sub?.status), true);
    });

    await check('second identical delivery is idempotent no-op', async () => {
      const event = constructStripeEvent(payload, header);
      const second = await processStripeWebhookEvent(event);
      assert.equal(second.ok, true);
      if (second.ok) assert.equal(second.duplicate, true);
      const [sub] = await db
        .select({
          status: platformOrganizationSubscriptions.status,
          stripeSubscriptionId: platformOrganizationSubscriptions.stripeSubscriptionId,
        })
        .from(platformOrganizationSubscriptions)
        .where(eq(platformOrganizationSubscriptions.organizationId, orgId!))
        .limit(1);
      assert.equal(sub?.status, 'active');
      assert.equal(sub?.stripeSubscriptionId, 'sub_staging_verify');
      const events = await db
        .select()
        .from(platformBillingWebhookEvents)
        .where(eq(platformBillingWebhookEvents.eventId, eventId));
      assert.equal(events.length, 1);
    });

    await check('cancel webhook locks access', async () => {
      const cancelId = `${eventId}_cancel`;
      await applyStripeEventToSubscriptions({
        id: cancelId,
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_staging_verify',
            status: 'canceled',
            metadata: { organizationId: orgId },
            customer: 'cus_staging_verify',
          },
        },
      });
      const [sub] = await db
        .select({ status: platformOrganizationSubscriptions.status })
        .from(platformOrganizationSubscriptions)
        .where(eq(platformOrganizationSubscriptions.organizationId, orgId!))
        .limit(1);
      assert.equal(sub?.status, 'cancelled');
      assert.equal(isSubscriptionAccessAllowed(sub?.status), false);
      await __testOnlyDeleteWebhookEvent(cancelId);
    });

    await __testOnlyDeleteWebhookEvent(eventId);
  } finally {
    if (orgId) {
      await db
        .delete(platformOrganizationSubscriptions)
        .where(eq(platformOrganizationSubscriptions.organizationId, orgId));
      await db.delete(platformOrganizations).where(eq(platformOrganizations.id, orgId));
    }
    await close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n=== Webhook staging verify summary ===');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  if (failed.length) process.exit(1);
  console.log('All webhook staging checks passed.');
  console.log(
    'Note: Stripe CLI `stripe trigger` needs live PLATFORM_STRIPE_* keys; HMAC double-delivery above is the same signature scheme CLI uses.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
