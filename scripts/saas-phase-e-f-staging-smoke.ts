/* eslint-disable no-console */
/**
 * Staging smoke: subscription webhook activate → access → cancel lock + Phase F host mismatch.
 * Does not enable FYH_SAAS_TENANT in production files.
 *
 * Usage: npx tsx scripts/saas-phase-e-f-staging-smoke.ts
 */
import { requireStagingEnv } from '@/src/lib/db/loadStagingEnv';
requireStagingEnv();

process.env.FYH_SAAS_TENANT = '1';
process.env.PLATFORM_STRIPE_SECRET_KEY =
  process.env.PLATFORM_STRIPE_SECRET_KEY?.trim() || 'sk_test_staging_smoke';
process.env.PLATFORM_STRIPE_WEBHOOK_SECRET =
  process.env.PLATFORM_STRIPE_WEBHOOK_SECRET?.trim() || 'whsec_staging_smoke';

import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { createPlatformClient } from '@/src/platform/db/client';
import {
  platformOrganizationSubscriptions,
  platformOrganizations,
  platformPlans,
} from '@/src/platform/db/schema';
import {
  __testOnlyDeleteWebhookEvent,
  applyStripeEventToSubscriptions,
} from '@/src/platform/billing/stripe/webhook';
import {
  isSubscriptionAccessAllowed,
  listActiveMembershipsForUser,
  loadMembershipForUserOrg,
} from '@/src/platform/services/memberships';
import {
  isSessionHostOrgMismatch,
  parseHairTenantSlug,
  resolveOrganizationBySlug,
} from '@/src/hair/lib/tenant/subdomain';
import { isHairHost } from '@/src/hair/lib/host';

type Check = { name: string; ok: boolean; detail?: string };
const results: Check[] = [];

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, detail });
    console.error(`✗ ${name}: ${detail}`);
  }
}

async function main() {
  const { db, close } = createPlatformClient({ max: 1 });
  let orgA: string | null = null;
  let orgB: string | null = null;
  const stamp = Date.now();
  const evtActivate = `evt_smoke_act_${stamp}`;
  const evtCancel = `evt_smoke_can_${stamp}`;

  try {
    const [plan] = await db.select({ id: platformPlans.id }).from(platformPlans).limit(1);
    if (!plan) throw new Error('No plan');

    const slugA = `smoke-a-${stamp}`;
    const slugB = `smoke-b-${stamp}`;

    const [a] = await db
      .insert(platformOrganizations)
      .values({ slug: slugA, name: 'Smoke A', status: 'active' })
      .returning({ id: platformOrganizations.id });
    orgA = a!.id;
    const [b] = await db
      .insert(platformOrganizations)
      .values({ slug: slugB, name: 'Smoke B', status: 'active' })
      .returning({ id: platformOrganizations.id });
    orgB = b!.id;

    await db.insert(platformOrganizationSubscriptions).values({
      organizationId: orgA,
      planId: plan.id,
      status: 'incomplete',
    });
    await db.insert(platformOrganizationSubscriptions).values({
      organizationId: orgB,
      planId: plan.id,
      status: 'active',
    });

    await check('subscribe webhook → active access allowed', async () => {
      const r = await applyStripeEventToSubscriptions({
        id: evtActivate,
        type: 'checkout.session.completed',
        data: {
          object: {
            client_reference_id: orgA,
            metadata: { organizationId: orgA },
            subscription: `sub_smoke_${stamp}`,
            customer: `cus_smoke_${stamp}`,
          },
        },
      });
      assert.equal(r.duplicate, false);
      const [sub] = await db
        .select({ status: platformOrganizationSubscriptions.status })
        .from(platformOrganizationSubscriptions)
        .where(eq(platformOrganizationSubscriptions.organizationId, orgA!))
        .limit(1);
      assert.equal(sub?.status, 'active');
      assert.equal(isSubscriptionAccessAllowed(sub?.status), true);
    });

    await check('replay activate event is no-op', async () => {
      const r = await applyStripeEventToSubscriptions({
        id: evtActivate,
        type: 'checkout.session.completed',
        data: {
          object: {
            client_reference_id: orgA,
            metadata: { organizationId: orgA },
            subscription: `sub_smoke_${stamp}`,
            customer: `cus_smoke_${stamp}`,
          },
        },
      });
      assert.equal(r.duplicate, true);
    });

    await check('Phase F slug resolves to org A', async () => {
      assert.equal(parseHairTenantSlug(`${slugA}.fyhair.app`), slugA);
      assert.equal(isHairHost(`${slugA}.fyhair.app`), true);
      const host = await resolveOrganizationBySlug(slugA);
      assert.equal(host?.organizationId, orgA);
    });

    await check('Phase F Org A session on Org B host mismatches', async () => {
      const hostB = await resolveOrganizationBySlug(slugB);
      assert.ok(hostB);
      assert.equal(isSessionHostOrgMismatch(orgA, hostB!.organizationId), true);
      assert.equal(isSessionHostOrgMismatch(orgB, hostB!.organizationId), false);
    });

    await check('cancel → cancelled hard lock', async () => {
      await applyStripeEventToSubscriptions({
        id: evtCancel,
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: `sub_smoke_${stamp}`,
            status: 'canceled',
            metadata: { organizationId: orgA },
            customer: `cus_smoke_${stamp}`,
          },
        },
      });
      const [sub] = await db
        .select({ status: platformOrganizationSubscriptions.status })
        .from(platformOrganizationSubscriptions)
        .where(eq(platformOrganizationSubscriptions.organizationId, orgA!))
        .limit(1);
      assert.equal(sub?.status, 'cancelled');
      assert.equal(isSubscriptionAccessAllowed(sub?.status), false);
    });

    await __testOnlyDeleteWebhookEvent(evtActivate);
    await __testOnlyDeleteWebhookEvent(evtCancel);
  } finally {
    for (const id of [orgA, orgB]) {
      if (!id) continue;
      await db
        .delete(platformOrganizationSubscriptions)
        .where(eq(platformOrganizationSubscriptions.organizationId, id));
      await db.delete(platformOrganizations).where(eq(platformOrganizations.id, id));
    }
    await close();
  }

  console.log('\n=== Phase E+F staging smoke ===');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  }
  console.log('FYH_SAAS_TENANT production: leave unset/0 (smoke set it only in-process).');
  if (results.some((r) => !r.ok)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
