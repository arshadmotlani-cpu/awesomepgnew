import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCommissionEntries,
  fyhCustomerMemberships,
  fyhCustomerPackages,
  fyhCustomerTimeline,
  fyhCustomers,
  fyhMembershipPlans,
  fyhPackagePlanItems,
  fyhPackagePlans,
  fyhBridalEvents,
  fyhBridalProfiles,
  fyhNotificationOutbox,
  fyhNotificationTemplates,
  fyhServices,
  fyhStaff,
  type FyhMembershipTier,
  type FyhBridalEventType,
  type FyhNotificationKind,
} from '@/src/hair/db/schema';
import type { FyhPaymentMethod } from '@/src/hair/db/schema/billing';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';
import {
  allocateEffectiveUnitValues,
  computePackageNormalValuePaise,
} from '@/src/hair/domain/packages/economics';
import { createCustomerPackageEntitlement } from '@/src/hair/domain/packages/credits';

export async function listMembershipPlans(ctx?: TenantContext | null) {
  return hairDb
    .select()
    .from(fyhMembershipPlans)
    .where(and(orgFilter(fyhMembershipPlans.organizationId, ctx), eq(fyhMembershipPlans.isActive, true)))
    .orderBy(asc(fyhMembershipPlans.name));
}

export async function ensureDefaultMembershipPlans(ctx?: TenantContext | null) {
  const existing = await listMembershipPlans();
  if (existing.length > 0) return existing;
  const defaults: Array<{ name: string; tier: FyhMembershipTier; discountBps: number; pricePaise: number }> = [
    { name: 'Silver', tier: 'silver', discountBps: 500, pricePaise: 299900 },
    { name: 'Gold', tier: 'gold', discountBps: 1000, pricePaise: 499900 },
    { name: 'Platinum', tier: 'platinum', discountBps: 1500, pricePaise: 799900 },
    { name: 'VIP', tier: 'vip', discountBps: 2000, pricePaise: 999900 },
  ];
  await hairDb.insert(fyhMembershipPlans).values(
    defaults.map((d) => ({
      ...d,
      priorityBooking: d.tier === 'vip' || d.tier === 'platinum',
      birthdayBenefit: 'Complimentary hair spa',
      anniversaryOffer: '20% off package',
    })),
  );
  return listMembershipPlans();
}

export async function sellMembership(customerId: string, planId: string, ctx?: TenantContext | null) {
  return hairDb.transaction(async (tx) => {
    return sellMembershipWithDb(tx as unknown as typeof hairDb, customerId, planId);
  });
}

export async function sellMembershipWithDb(
  db: typeof hairDb,
  customerId: string,
  planId: string,
  ctx?: TenantContext | null,
) {
  const [plan] = await db
    .select()
    .from(fyhMembershipPlans)
    .where(and(orgFilter(fyhMembershipPlans.organizationId, ctx), eq(fyhMembershipPlans.id, planId)))
    .limit(1);
  if (!plan) throw new Error('Plan not found');
  const starts = new Date();
  const expires = new Date(starts);
  expires.setDate(expires.getDate() + plan.validityDays);
  await db
    .update(fyhCustomerMemberships)
    .set({ isActive: false })
    .where(and(orgFilter(fyhCustomerMemberships.organizationId, ctx), eq(fyhCustomerMemberships.customerId, customerId)));
  const [row] = await db
    .insert(fyhCustomerMemberships)
    .values({
      customerId,
      planId,
      startsOn: starts.toISOString().slice(0, 10),
      expiresOn: expires.toISOString().slice(0, 10),
    })
    .returning();
  await db
    .update(fyhCustomers)
    .set({ membership: plan.name, updatedAt: new Date() })
    .where(and(orgFilter(fyhCustomers.organizationId, ctx), eq(fyhCustomers.id, customerId)));
  return row;
}

export async function listPackagePlans(ctx?: TenantContext | null) {
  return hairDb
    .select()
    .from(fyhPackagePlans)
    .where(and(orgFilter(fyhPackagePlans.organizationId, ctx), eq(fyhPackagePlans.isActive, true)))
    .orderBy(asc(fyhPackagePlans.name));
}

export async function sellPackage(customerId: string, planId: string, ctx?: TenantContext | null) {
  return hairDb.transaction(async (tx) => {
    return sellPackageWithDb(tx as unknown as typeof hairDb, customerId, planId, undefined, ctx);
  });
}

export async function sellPackageWithDb(
  db: typeof hairDb,
  customerId: string,
  planId: string,
  opts?: {
    purchaseInvoiceId?: string | null;
    purchaseInvoiceLineId?: string | null;
  },
  ctx?: TenantContext | null,
) {
  const [plan] = await db
    .select()
    .from(fyhPackagePlans)
    .where(and(orgFilter(fyhPackagePlans.organizationId, ctx), eq(fyhPackagePlans.id, planId)))
    .limit(1);
  if (!plan) throw new Error('Package not found');

  const planItems = await db
    .select({
      serviceId: fyhPackagePlanItems.serviceId,
      quantity: fyhPackagePlanItems.quantity,
      serviceName: fyhServices.name,
      retailUnitPaise: fyhServices.pricePaise,
    })
    .from(fyhPackagePlanItems)
    .innerJoin(fyhServices, eq(fyhServices.id, fyhPackagePlanItems.serviceId))
    .where(and(orgFilter(fyhPackagePlanItems.organizationId, ctx), eq(fyhPackagePlanItems.planId, planId)));

  let entitlementItems: Array<{
    serviceId: string;
    serviceName: string;
    quantity: number;
    retailUnitPaise: number;
  }>;

  if (planItems.length > 0) {
    entitlementItems = planItems.map((item) => ({
      serviceId: item.serviceId,
      serviceName: item.serviceName,
      quantity: item.quantity,
      retailUnitPaise: item.retailUnitPaise,
    }));
  } else if (plan.serviceId) {
    const [service] = await db
      .select({ id: fyhServices.id, name: fyhServices.name, pricePaise: fyhServices.pricePaise })
      .from(fyhServices)
      .where(and(orgFilter(fyhServices.organizationId, ctx), eq(fyhServices.id, plan.serviceId)))
      .limit(1);
    if (!service) throw new Error('Package service not found');
    entitlementItems = [
      {
        serviceId: service.id,
        serviceName: service.name,
        quantity: Math.max(1, plan.totalSessions),
        retailUnitPaise: service.pricePaise,
      },
    ];
  } else {
    throw new Error('Package plan has no services');
  }

  const offerPricePaise = plan.pricePaise;
  const normalValuePaise =
    plan.normalValuePaise > 0
      ? plan.normalValuePaise
      : computePackageNormalValuePaise(
          entitlementItems.map((i) => ({ retailUnitPaise: i.retailUnitPaise, quantity: i.quantity })),
        );
  const allocated = allocateEffectiveUnitValues(
    entitlementItems.map((i) => ({
      serviceId: i.serviceId,
      quantity: i.quantity,
      retailUnitPaise: i.retailUnitPaise,
    })),
    offerPricePaise,
  );
  const allocatedByService = new Map(allocated.map((a) => [a.serviceId, a]));

  const entitlementId = await createCustomerPackageEntitlement(
    db,
    {
      customerId,
      planId,
      purchaseInvoiceId: opts?.purchaseInvoiceId ?? null,
      purchaseInvoiceLineId: opts?.purchaseInvoiceLineId ?? null,
      nameSnapshot: plan.name,
      offerPricePaise,
      normalValuePaise,
      validityDays: plan.validityDays ?? null,
      items: entitlementItems.map((item) => ({
        serviceId: item.serviceId,
        serviceName: item.serviceName,
        quantity: item.quantity,
        effectiveUnitPaise: allocatedByService.get(item.serviceId)?.effectiveUnitPaise ?? 0,
      })),
    },
    ctx,
  );

  const [row] = await db
    .select()
    .from(fyhCustomerPackages)
    .where(and(orgFilter(fyhCustomerPackages.organizationId, ctx), eq(fyhCustomerPackages.id, entitlementId)))
    .limit(1);
  return row!;
}

export async function listCommissionSummary(ctx?: TenantContext | null) {
  return hairDb
    .select({
      staffId: fyhCommissionEntries.staffId,
      staffName: fyhStaff.fullName,
      pendingPaise: sql<number>`coalesce(sum(case when ${fyhCommissionEntries.status} = 'pending' then ${fyhCommissionEntries.amountPaise} else 0 end), 0)::bigint`,
      paidPaise: sql<number>`coalesce(sum(case when ${fyhCommissionEntries.status} = 'paid' then ${fyhCommissionEntries.amountPaise} else 0 end), 0)::bigint`,
    })
    .from(fyhCommissionEntries)
    .innerJoin(fyhStaff, eq(fyhStaff.id, fyhCommissionEntries.staffId))
    .groupBy(fyhCommissionEntries.staffId, fyhStaff.fullName)
    .orderBy(desc(sql`sum(${fyhCommissionEntries.amountPaise})`));
}

export async function markCommissionsPaid(staffId: string, ctx?: TenantContext | null) {
  await hairDb
    .update(fyhCommissionEntries)
    .set({ status: 'paid', paidAt: new Date() })
    .where(and(eq(fyhCommissionEntries.staffId, staffId), eq(fyhCommissionEntries.status, 'pending')));
}

export async function listBridalProfiles(ctx?: TenantContext | null) {
  return hairDb
    .select({
      profile: fyhBridalProfiles,
      customerName: fyhCustomers.fullName,
      phone: fyhCustomers.phone,
    })
    .from(fyhBridalProfiles)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhBridalProfiles.customerId))
    .orderBy(desc(fyhBridalProfiles.createdAt));
}

export async function createBridalProfile(input: {
  customerId: string;
  brideName: string;
  weddingDate?: string | null;
  notes?: string | null;
}) {
  const [row] = await hairDb
    .insert(fyhBridalProfiles)
    .values({
      customerId: input.customerId,
      brideName: input.brideName.trim(),
      weddingDate: input.weddingDate || null,
      notes: input.notes || null,
    })
    .returning();
  return row!;
}

export async function addBridalEvent(
  bridalProfileId: string,
  eventType: FyhBridalEventType,
  eventDate?: string | null,
  amountPaise = 0,
) {
  const [row] = await hairDb
    .insert(fyhBridalEvents)
    .values({ bridalProfileId, eventType, eventDate: eventDate || null, amountPaise })
    .returning();
  return row!;
}

export async function ensureNotificationTemplates(ctx?: TenantContext | null) {
  const kinds: Array<{ kind: FyhNotificationKind; body: string }> = [
    { kind: 'appointment_reminder', body: 'Hi {{name}}, reminder for your appointment tomorrow at {{time}}.' },
    { kind: 'appointment_confirmation', body: 'Hi {{name}}, your appointment is confirmed for {{time}}.' },
    { kind: 'birthday', body: 'Happy Birthday {{name}}! Enjoy a special treat at For Your Hair.' },
    { kind: 'anniversary', body: 'Happy Anniversary {{name}}! Visit us for a celebration offer.' },
    { kind: 'membership_expiry', body: 'Hi {{name}}, your membership expires on {{date}}.' },
    { kind: 'package_expiry', body: 'Hi {{name}}, your package sessions expire on {{date}}.' },
    { kind: 'outstanding_payment', body: 'Hi {{name}}, you have an outstanding balance of {{amount}}.' },
    { kind: 'review_request', body: 'Hi {{name}}, how was your visit? We would love your feedback.' },
    { kind: 'follow_up', body: 'Hi {{name}}, checking in after your service. Book your next visit anytime.' },
    { kind: 'low_stock', body: 'Low stock alert: {{product}} is below reorder level.' },
    { kind: 'invoice_ready', body: 'Hi {{name}}, your invoice for {{amount}} is ready: {{link}}' },
  ];
  for (const k of kinds) {
    await hairDb
      .insert(fyhNotificationTemplates)
      .values({ kind: k.kind, body: k.body, subject: k.kind.replace(/_/g, ' ') })
      .onConflictDoNothing({ target: fyhNotificationTemplates.kind });
  }
}

export async function enqueueNotification(
  input: {
    kind: FyhNotificationKind;
    recipient: string;
    body: string;
    subject?: string;
  },
  ctx?: TenantContext | null,
) {
  const [row] = await hairDb
    .insert(fyhNotificationOutbox)
    .values({
      ...tenantOrgDefaults(ctx),
      kind: input.kind,
      recipient: input.recipient,
      body: input.body,
      subject: input.subject ?? null,
      status: 'pending',
    })
    .returning();
  return row!;
}

export async function listOutbox(limit = 50, ctx?: TenantContext | null) {
  return hairDb
    .select()
    .from(fyhNotificationOutbox)
    .orderBy(desc(fyhNotificationOutbox.createdAt))
    .limit(limit);
}

export async function processOutboxBatch(limit = 20, ctx?: TenantContext | null) {
  const { processOutboxBatch: processBatch } = await import('@/src/hair/services/notifications');
  const result = await processBatch(limit);
  return result.processed;
}

export async function topUpWallet(customerId: string, amountPaise: number, ctx?: TenantContext | null) {
  if (amountPaise <= 0) throw new Error('Top-up amount must be positive');

  return hairDb.transaction(async (tx) => {
    const db = tx as unknown as typeof hairDb;
    const [customer] = await tx
      .select({ id: fyhCustomers.id })
      .from(fyhCustomers)
      .where(and(eq(fyhCustomers.id, customerId), eq(fyhCustomers.isActive, true)))
      .limit(1);
    if (!customer) throw new Error('Customer not found');

    const { creditWalletAdvance, reconcileCustomerWalletCache } = await import(
      '@/src/hair/domain/ledger/service'
    );
    await creditWalletAdvance(db, {
      customerId: customer.id,
      invoiceId: null,
      amountPaise,
      reference: 'wallet_top_up',
    });
    return reconcileCustomerWalletCache(db, customer.id);
  });
}

export type AdvancePaymentMethod = Extract<FyhPaymentMethod, 'cash' | 'upi' | 'card' | 'bank'>;

export async function recordAdvancePayment(input: {
  customerId: string;
  amountPaise: number;
  method: AdvancePaymentMethod;
  reference?: string | null;
  notes?: string | null;
}, ctx?: TenantContext | null) {
  if (input.amountPaise <= 0) throw new Error('Amount must be positive');

  return hairDb.transaction(async (tx) => {
    const db = tx as unknown as typeof hairDb;
    const [customer] = await tx
      .select()
      .from(fyhCustomers)
      .where(and(eq(fyhCustomers.id, input.customerId), eq(fyhCustomers.isActive, true)))
      .limit(1);
    if (!customer) throw new Error('Customer not found');

    const { creditWalletAdvance } = await import('@/src/hair/domain/ledger/service');
    await creditWalletAdvance(db, {
      customerId: customer.id,
      invoiceId: null,
      amountPaise: input.amountPaise,
      reference: input.reference ?? input.method,
    });

    const [updated] = await tx
      .select({ walletBalancePaise: fyhCustomers.walletBalancePaise })
      .from(fyhCustomers)
      .where(and(orgFilter(fyhCustomers.organizationId, ctx), eq(fyhCustomers.id, customer.id)))
      .limit(1);

    await tx.insert(fyhCustomerTimeline).values({
      customerId: customer.id,
      eventType: 'wallet',
      title: 'Advance payment',
      body: `${formatInrFromPaise(input.amountPaise)} via ${input.method}${input.notes ? ` · ${input.notes}` : ''}`,
      metadata: {
        source: 'advance_payment',
        method: input.method,
        amountPaise: input.amountPaise,
        reference: input.reference ?? null,
      },
    });

    return { walletBalancePaise: updated?.walletBalancePaise ?? customer.walletBalancePaise };
  });
}
