import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCommissionEntries,
  fyhCustomerMemberships,
  fyhCustomerPackages,
  fyhCustomerTimeline,
  fyhCustomers,
  fyhMembershipPlans,
  fyhPackagePlans,
  fyhBridalEvents,
  fyhBridalProfiles,
  fyhNotificationOutbox,
  fyhNotificationTemplates,
  fyhStaff,
  type FyhMembershipTier,
  type FyhBridalEventType,
  type FyhNotificationKind,
} from '@/src/hair/db/schema';
import type { FyhPaymentMethod } from '@/src/hair/db/schema/billing';
import { formatInrFromPaise } from '@/src/hair/lib/money';

export async function listMembershipPlans() {
  return hairDb
    .select()
    .from(fyhMembershipPlans)
    .where(eq(fyhMembershipPlans.isActive, true))
    .orderBy(asc(fyhMembershipPlans.name));
}

export async function ensureDefaultMembershipPlans() {
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

export async function sellMembership(customerId: string, planId: string) {
  return hairDb.transaction(async (tx) => {
    return sellMembershipWithDb(tx as unknown as typeof hairDb, customerId, planId);
  });
}

export async function sellMembershipWithDb(
  db: typeof hairDb,
  customerId: string,
  planId: string,
) {
  const [plan] = await db
    .select()
    .from(fyhMembershipPlans)
    .where(eq(fyhMembershipPlans.id, planId))
    .limit(1);
  if (!plan) throw new Error('Plan not found');
  const starts = new Date();
  const expires = new Date(starts);
  expires.setDate(expires.getDate() + plan.validityDays);
  await db
    .update(fyhCustomerMemberships)
    .set({ isActive: false })
    .where(eq(fyhCustomerMemberships.customerId, customerId));
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
    .where(eq(fyhCustomers.id, customerId));
  return row;
}

export async function listPackagePlans() {
  return hairDb
    .select()
    .from(fyhPackagePlans)
    .where(eq(fyhPackagePlans.isActive, true))
    .orderBy(asc(fyhPackagePlans.name));
}

export async function sellPackage(customerId: string, planId: string) {
  return hairDb.transaction(async (tx) => {
    return sellPackageWithDb(tx as unknown as typeof hairDb, customerId, planId);
  });
}

export async function sellPackageWithDb(
  db: typeof hairDb,
  customerId: string,
  planId: string,
) {
  const [plan] = await db.select().from(fyhPackagePlans).where(eq(fyhPackagePlans.id, planId)).limit(1);
  if (!plan) throw new Error('Package not found');
  const expires = new Date();
  expires.setDate(expires.getDate() + plan.validityDays);
  const [row] = await db
    .insert(fyhCustomerPackages)
    .values({
      customerId,
      planId,
      totalSessions: plan.totalSessions,
      expiresOn: expires.toISOString().slice(0, 10),
    })
    .returning();
  await db
    .update(fyhCustomers)
    .set({
      packagesPurchased: sql`${fyhCustomers.packagesPurchased} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(fyhCustomers.id, customerId));
  return row;
}

export async function listCommissionSummary() {
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

export async function markCommissionsPaid(staffId: string) {
  await hairDb
    .update(fyhCommissionEntries)
    .set({ status: 'paid', paidAt: new Date() })
    .where(and(eq(fyhCommissionEntries.staffId, staffId), eq(fyhCommissionEntries.status, 'pending')));
}

export async function listBridalProfiles() {
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

export async function ensureNotificationTemplates() {
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

export async function enqueueNotification(input: {
  kind: FyhNotificationKind;
  recipient: string;
  body: string;
  subject?: string;
}) {
  const [row] = await hairDb
    .insert(fyhNotificationOutbox)
    .values({
      kind: input.kind,
      recipient: input.recipient,
      body: input.body,
      subject: input.subject ?? null,
      status: 'pending',
    })
    .returning();
  return row!;
}

export async function listOutbox(limit = 50) {
  return hairDb
    .select()
    .from(fyhNotificationOutbox)
    .orderBy(desc(fyhNotificationOutbox.createdAt))
    .limit(limit);
}

export async function processOutboxBatch(limit = 20) {
  const { processOutboxBatch: processBatch } = await import('@/src/hair/services/notifications');
  const result = await processBatch(limit);
  return result.processed;
}

export async function topUpWallet(customerId: string, amountPaise: number) {
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
}) {
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
      .where(eq(fyhCustomers.id, customer.id))
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
