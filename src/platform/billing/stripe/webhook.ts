import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import {
  platformBillingWebhookEvents,
  platformOrganizationSubscriptions,
  platformSubscriptionEvents,
  type PlatformSubscriptionStatus,
} from '@/src/platform/db/schema';
import { createPlatformClient } from '@/src/platform/db/client';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';
import {
  getPlatformStripe,
  getPlatformStripeWebhookSecret,
  mapStripeSubscriptionStatus,
} from './client';

export type ProcessStripeWebhookResult =
  | { ok: true; duplicate: boolean; eventType: string }
  | { ok: false; error: string };

export function constructStripeEvent(
  rawBody: string | Buffer,
  signature: string | null,
): Stripe.Event {
  if (!signature) throw new Error('Missing Stripe-Signature header');
  return getPlatformStripe().webhooks.constructEvent(
    rawBody,
    signature,
    getPlatformStripeWebhookSecret(),
  );
}

async function markEventProcessed(event: {
  id: string;
  type: string;
}): Promise<'inserted' | 'duplicate'> {
  if (!hasPlatformDatabaseUrl()) throw new Error('Platform database is not configured');
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const inserted = await db
      .insert(platformBillingWebhookEvents)
      .values({
        eventId: event.id,
        provider: 'stripe',
        eventType: event.type,
        payload: event as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing()
      .returning({ eventId: platformBillingWebhookEvents.eventId });
    return inserted.length > 0 ? 'inserted' : 'duplicate';
  } finally {
    await close();
  }
}

async function applySubscriptionUpdate(input: {
  organizationId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  stripePriceId?: string | null;
  status: PlatformSubscriptionStatus;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  stripeEventId: string;
  eventType: string;
}): Promise<void> {
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    let row =
      input.stripeSubscriptionId
        ? (
            await db
              .select()
              .from(platformOrganizationSubscriptions)
              .where(
                eq(
                  platformOrganizationSubscriptions.stripeSubscriptionId,
                  input.stripeSubscriptionId,
                ),
              )
              .limit(1)
          )[0]
        : undefined;
    if (!row && input.organizationId) {
      row = (
        await db
          .select()
          .from(platformOrganizationSubscriptions)
          .where(eq(platformOrganizationSubscriptions.organizationId, input.organizationId))
          .limit(1)
      )[0];
    }
    if (!row && input.stripeCustomerId) {
      row = (
        await db
          .select()
          .from(platformOrganizationSubscriptions)
          .where(eq(platformOrganizationSubscriptions.stripeCustomerId, input.stripeCustomerId))
          .limit(1)
      )[0];
    }
    if (!row) return;

    await db
      .update(platformOrganizationSubscriptions)
      .set({
        status: input.status,
        stripeSubscriptionId: input.stripeSubscriptionId ?? row.stripeSubscriptionId,
        stripeCustomerId: input.stripeCustomerId ?? row.stripeCustomerId,
        stripePriceId: input.stripePriceId ?? row.stripePriceId,
        currentPeriodStart: input.periodStart ?? row.currentPeriodStart,
        currentPeriodEnd: input.periodEnd ?? row.currentPeriodEnd,
        updatedAt: new Date(),
      })
      .where(eq(platformOrganizationSubscriptions.id, row.id));

    await db
      .insert(platformSubscriptionEvents)
      .values({
        organizationId: row.organizationId,
        subscriptionId: row.id,
        eventType: input.eventType,
        detail: `status=${input.status}`,
        stripeEventId: input.stripeEventId,
      })
      .onConflictDoNothing();
  } finally {
    await close();
  }
}

export async function applyStripeEventToSubscriptions(event: {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}): Promise<{ duplicate: boolean }> {
  const mark = await markEventProcessed(event);
  if (mark === 'duplicate') return { duplicate: true };
  const obj = event.data.object;

  if (event.type === 'checkout.session.completed') {
    const meta = obj.metadata as { organizationId?: string } | undefined;
    await applySubscriptionUpdate({
      organizationId:
        meta?.organizationId ??
        (typeof obj.client_reference_id === 'string' ? obj.client_reference_id : null),
      stripeSubscriptionId: typeof obj.subscription === 'string' ? obj.subscription : null,
      stripeCustomerId: typeof obj.customer === 'string' ? obj.customer : null,
      status: 'active',
      stripeEventId: event.id,
      eventType: event.type,
    });
    return { duplicate: false };
  }

  if (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.created'
  ) {
    const sub = obj as unknown as Stripe.Subscription;
    const start = (sub as { current_period_start?: number }).current_period_start;
    const end = (sub as { current_period_end?: number }).current_period_end;
    await applySubscriptionUpdate({
      organizationId: sub.metadata?.organizationId ?? null,
      stripeSubscriptionId: sub.id,
      stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null,
      stripePriceId: sub.items?.data?.[0]?.price?.id ?? null,
      status: mapStripeSubscriptionStatus(sub.status),
      periodStart: typeof start === 'number' ? new Date(start * 1000) : null,
      periodEnd: typeof end === 'number' ? new Date(end * 1000) : null,
      stripeEventId: event.id,
      eventType: event.type,
    });
    return { duplicate: false };
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = obj as unknown as Stripe.Subscription;
    await applySubscriptionUpdate({
      organizationId: sub.metadata?.organizationId ?? null,
      stripeSubscriptionId: typeof obj.id === 'string' ? obj.id : sub.id,
      status: 'cancelled',
      stripeEventId: event.id,
      eventType: event.type,
    });
    return { duplicate: false };
  }

  if (event.type === 'invoice.payment_failed' || event.type === 'invoice.paid') {
    const subRef = obj.subscription;
    await applySubscriptionUpdate({
      stripeSubscriptionId: typeof subRef === 'string' ? subRef : null,
      stripeCustomerId: typeof obj.customer === 'string' ? obj.customer : null,
      status: event.type === 'invoice.payment_failed' ? 'past_due' : 'active',
      stripeEventId: event.id,
      eventType: event.type,
    });
    return { duplicate: false };
  }

  return { duplicate: false };
}

export async function processStripeWebhookEvent(
  event: Stripe.Event,
): Promise<ProcessStripeWebhookResult> {
  try {
    const result = await applyStripeEventToSubscriptions({
      id: event.id,
      type: event.type,
      data: { object: event.data.object as unknown as Record<string, unknown> },
    });
    return { ok: true, duplicate: result.duplicate, eventType: event.type };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'webhook_processing_failed',
    };
  }
}

export async function __testOnlyDeleteWebhookEvent(eventId: string): Promise<void> {
  if (!hasPlatformDatabaseUrl()) return;
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    await db
      .delete(platformBillingWebhookEvents)
      .where(eq(platformBillingWebhookEvents.eventId, eventId));
    await db
      .delete(platformSubscriptionEvents)
      .where(eq(platformSubscriptionEvents.stripeEventId, eventId));
  } finally {
    await close();
  }
}
