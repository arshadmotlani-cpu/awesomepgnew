import { and, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCustomerPackageCredits,
  fyhCustomerPackages,
  fyhCustomers,
  fyhPackageCreditLedger,
} from '@/src/hair/db/schema';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

type HairDb = typeof hairDb;

export type ActivePackageCreditRow = {
  creditId: string;
  customerPackageId: string;
  serviceId: string;
  serviceNameSnapshot: string;
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
  effectiveUnitValuePaise: number;
  nameSnapshot: string | null;
  expiresOn: string | null;
  offerPricePaise: number;
  normalValuePaise: number;
};

export type CreateCustomerPackageEntitlementInput = {
  customerId: string;
  planId: string;
  purchaseInvoiceId?: string | null;
  purchaseInvoiceLineId?: string | null;
  nameSnapshot: string;
  offerPricePaise: number;
  normalValuePaise: number;
  validityDays: number | null;
  items: Array<{
    serviceId: string;
    serviceName: string;
    quantity: number;
    effectiveUnitPaise: number;
  }>;
};

export type RedeemPackageCreditsInput = {
  customerId: string;
  creditId: string;
  quantity: number;
  invoiceId: string;
  invoiceLineId: string;
  idempotencyKey: string;
};

export type RedeemPackageCreditsResult = {
  effectiveValuePaise: number;
  serviceId: string;
  customerPackageId: string;
};

export async function listActivePackageCreditsForCustomer(
  db: HairDb,
  customerId: string,
  ctx?: TenantContext | null,
): Promise<ActivePackageCreditRow[]> {
  const rows = await db
    .select({
      creditId: fyhCustomerPackageCredits.id,
      customerPackageId: fyhCustomerPackageCredits.customerPackageId,
      serviceId: fyhCustomerPackageCredits.serviceId,
      serviceNameSnapshot: fyhCustomerPackageCredits.serviceNameSnapshot,
      totalCredits: fyhCustomerPackageCredits.totalCredits,
      usedCredits: fyhCustomerPackageCredits.usedCredits,
      effectiveUnitValuePaise: fyhCustomerPackageCredits.effectiveUnitValuePaise,
      nameSnapshot: fyhCustomerPackages.nameSnapshot,
      expiresOn: fyhCustomerPackages.expiresOn,
      offerPricePaise: fyhCustomerPackages.offerPricePaise,
      normalValuePaise: fyhCustomerPackages.normalValuePaise,
    })
    .from(fyhCustomerPackageCredits)
    .innerJoin(
      fyhCustomerPackages,
      eq(fyhCustomerPackages.id, fyhCustomerPackageCredits.customerPackageId),
    )
    .where(
      and(
        orgFilter(fyhCustomerPackages.organizationId, ctx),
        eq(fyhCustomerPackages.customerId, customerId),
        eq(fyhCustomerPackages.isActive, true),
        eq(fyhCustomerPackages.isFrozen, false),
        or(isNull(fyhCustomerPackages.expiresOn), gte(fyhCustomerPackages.expiresOn, todayYmd())),
        sql`${fyhCustomerPackageCredits.usedCredits} < ${fyhCustomerPackageCredits.totalCredits}`,
      ),
    );

  return rows.map((row) => ({
    ...row,
    remainingCredits: Math.max(0, row.totalCredits - row.usedCredits),
  }));
}

export async function createCustomerPackageEntitlement(
  db: HairDb,
  input: CreateCustomerPackageEntitlementInput,
  ctx?: TenantContext | null,
): Promise<string> {
  if (!input.items.length) throw new Error('Package entitlement requires at least one credit item');
  for (const item of input.items) {
    if (item.quantity <= 0) throw new Error('Credit quantity must be positive');
  }

  const totalSessions = input.items.reduce((sum, item) => sum + item.quantity, 0);
  let expiresOn: string | null = null;
  if (input.validityDays != null) {
    const expires = new Date();
    expires.setDate(expires.getDate() + input.validityDays);
    expiresOn = expires.toISOString().slice(0, 10);
  }

  const orgDefaults = tenantOrgDefaults(ctx);
  const [pkg] = await db
    .insert(fyhCustomerPackages)
    .values({
      ...orgDefaults,
      customerId: input.customerId,
      planId: input.planId,
      nameSnapshot: input.nameSnapshot,
      offerPricePaise: input.offerPricePaise,
      normalValuePaise: input.normalValuePaise,
      purchaseInvoiceId: input.purchaseInvoiceId ?? null,
      purchaseInvoiceLineId: input.purchaseInvoiceLineId ?? null,
      totalSessions,
      usedSessions: 0,
      expiresOn,
    })
    .returning({ id: fyhCustomerPackages.id });

  if (!pkg) throw new Error('Failed to create customer package entitlement');

  for (const item of input.items) {
    const [credit] = await db
      .insert(fyhCustomerPackageCredits)
      .values({
        ...orgDefaults,
        customerPackageId: pkg.id,
        serviceId: item.serviceId,
        serviceNameSnapshot: item.serviceName,
        totalCredits: item.quantity,
        usedCredits: 0,
        effectiveUnitValuePaise: item.effectiveUnitPaise,
      })
      .returning({ id: fyhCustomerPackageCredits.id });

    if (!credit) throw new Error('Failed to create package credit row');

    await db.insert(fyhPackageCreditLedger).values({
      ...orgDefaults,
      customerPackageId: pkg.id,
      creditId: credit.id,
      eventType: 'purchase',
      serviceId: item.serviceId,
      quantity: item.quantity,
      effectiveValuePaise: item.effectiveUnitPaise * item.quantity,
      invoiceId: input.purchaseInvoiceId ?? null,
      invoiceLineId: input.purchaseInvoiceLineId ?? null,
      idempotencyKey: `purchase:${pkg.id}:${credit.id}`,
    });
  }

  await db
    .update(fyhCustomers)
    .set({
      packagesPurchased: sql`${fyhCustomers.packagesPurchased} + 1`,
      updatedAt: new Date(),
    })
    .where(and(orgFilter(fyhCustomers.organizationId, ctx), eq(fyhCustomers.id, input.customerId)));

  return pkg.id;
}

export async function redeemPackageCredits(
  db: HairDb,
  input: RedeemPackageCreditsInput,
  ctx?: TenantContext | null,
): Promise<RedeemPackageCreditsResult> {
  const quantity = Math.floor(Number(input.quantity) || 0);
  if (quantity <= 0) throw new Error('Redeem quantity must be positive');

  const [existing] = await db
    .select()
    .from(fyhPackageCreditLedger)
    .where(eq(fyhPackageCreditLedger.idempotencyKey, input.idempotencyKey))
    .limit(1);

  if (existing) {
    if (!existing.serviceId) throw new Error('Existing redeem ledger row missing serviceId');
    return {
      effectiveValuePaise: existing.effectiveValuePaise,
      serviceId: existing.serviceId,
      customerPackageId: existing.customerPackageId,
    };
  }

  const [credit] = await db
    .select({
      id: fyhCustomerPackageCredits.id,
      customerPackageId: fyhCustomerPackageCredits.customerPackageId,
      serviceId: fyhCustomerPackageCredits.serviceId,
      totalCredits: fyhCustomerPackageCredits.totalCredits,
      usedCredits: fyhCustomerPackageCredits.usedCredits,
      effectiveUnitValuePaise: fyhCustomerPackageCredits.effectiveUnitValuePaise,
      packageCustomerId: fyhCustomerPackages.customerId,
      isActive: fyhCustomerPackages.isActive,
      isFrozen: fyhCustomerPackages.isFrozen,
      expiresOn: fyhCustomerPackages.expiresOn,
    })
    .from(fyhCustomerPackageCredits)
    .innerJoin(
      fyhCustomerPackages,
      eq(fyhCustomerPackages.id, fyhCustomerPackageCredits.customerPackageId),
    )
    .where(
      and(
        orgFilter(fyhCustomerPackageCredits.organizationId, ctx),
        eq(fyhCustomerPackageCredits.id, input.creditId),
      ),
    )
    .limit(1);

  if (!credit) throw new Error('Package credit not found');
  if (credit.packageCustomerId !== input.customerId) {
    throw new Error('Package credit does not belong to customer');
  }
  if (!credit.isActive || credit.isFrozen) {
    throw new Error('Package entitlement is not redeemable');
  }

  const [updated] = await db
    .update(fyhCustomerPackageCredits)
    .set({
      usedCredits: sql`${fyhCustomerPackageCredits.usedCredits} + ${quantity}`,
    })
    .where(
      and(
        eq(fyhCustomerPackageCredits.id, credit.id),
        sql`${fyhCustomerPackageCredits.usedCredits} + ${quantity} <= ${fyhCustomerPackageCredits.totalCredits}`,
      ),
    )
    .returning({
      id: fyhCustomerPackageCredits.id,
      customerPackageId: fyhCustomerPackageCredits.customerPackageId,
      serviceId: fyhCustomerPackageCredits.serviceId,
      effectiveUnitValuePaise: fyhCustomerPackageCredits.effectiveUnitValuePaise,
    });

  if (!updated) throw new Error('Insufficient package credits');

  await db
    .update(fyhCustomerPackages)
    .set({
      usedSessions: sql`${fyhCustomerPackages.usedSessions} + ${quantity}`,
    })
    .where(eq(fyhCustomerPackages.id, updated.customerPackageId));

  const effectiveValuePaise = updated.effectiveUnitValuePaise * quantity;
  const orgDefaults = tenantOrgDefaults(ctx);

  await db.insert(fyhPackageCreditLedger).values({
    ...orgDefaults,
    customerPackageId: updated.customerPackageId,
    creditId: updated.id,
    eventType: 'redeem',
    serviceId: updated.serviceId,
    quantity,
    effectiveValuePaise,
    invoiceId: input.invoiceId,
    invoiceLineId: input.invoiceLineId,
    idempotencyKey: input.idempotencyKey,
  });

  return {
    effectiveValuePaise,
    serviceId: updated.serviceId,
    customerPackageId: updated.customerPackageId,
  };
}
