import { and, asc, eq, inArray } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhPackagePlanItems, fyhPackagePlans, fyhServices } from '@/src/hair/db/schema';
import {
  allocateEffectiveUnitValues,
  computePackageDiscount,
  computePackageNormalValuePaise,
} from '@/src/hair/domain/packages/economics';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';

export type PackagePlanItemInput = {
  serviceId: string;
  quantity: number;
};

export type PackagePlanDetailedItem = {
  id: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  retailUnitPaise: number;
};

export type PackagePlanDetailed = {
  id: string;
  name: string;
  serviceId: string | null;
  totalSessions: number;
  offerPricePaise: number;
  normalValuePaise: number;
  validityDays: number | null;
  isActive: boolean;
  items: PackagePlanDetailedItem[];
  discountAmountPaise: number;
  discountBps: number;
  discountPercentDisplay: number;
};

async function loadServicePriceMap(
  serviceIds: string[],
  ctx?: TenantContext | null,
): Promise<Map<string, { name: string; pricePaise: number }>> {
  if (serviceIds.length === 0) return new Map();
  const rows = await hairDb
    .select({
      id: fyhServices.id,
      name: fyhServices.name,
      pricePaise: fyhServices.pricePaise,
    })
    .from(fyhServices)
    .where(and(orgFilter(fyhServices.organizationId, ctx), inArray(fyhServices.id, serviceIds)));
  return new Map(rows.map((r) => [r.id, { name: r.name, pricePaise: r.pricePaise }]));
}

function validatePlanItems(items: PackagePlanItemInput[]) {
  if (!items.length) throw new Error('Package plan requires at least one service item');
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.serviceId) throw new Error('Each plan item requires a service');
    if (item.quantity <= 0) throw new Error('Plan item quantity must be positive');
    if (seen.has(item.serviceId)) throw new Error('Duplicate service in package plan items');
    seen.add(item.serviceId);
  }
}

export async function listPackagePlansDetailed(
  opts?: { includeInactive?: boolean },
  ctx?: TenantContext | null,
): Promise<PackagePlanDetailed[]> {
  ctx = await resolveTenantContextForService(ctx);
  const conditions = [orgFilter(fyhPackagePlans.organizationId, ctx)];
  if (!opts?.includeInactive) {
    conditions.push(eq(fyhPackagePlans.isActive, true));
  }

  const plans = await hairDb
    .select()
    .from(fyhPackagePlans)
    .where(and(...conditions))
    .orderBy(asc(fyhPackagePlans.name));

  if (plans.length === 0) return [];

  const planIds = plans.map((p) => p.id);
  const itemRows = await hairDb
    .select({
      id: fyhPackagePlanItems.id,
      planId: fyhPackagePlanItems.planId,
      serviceId: fyhPackagePlanItems.serviceId,
      quantity: fyhPackagePlanItems.quantity,
      serviceName: fyhServices.name,
      retailUnitPaise: fyhServices.pricePaise,
    })
    .from(fyhPackagePlanItems)
    .innerJoin(fyhServices, eq(fyhServices.id, fyhPackagePlanItems.serviceId))
    .where(and(orgFilter(fyhPackagePlanItems.organizationId, ctx), inArray(fyhPackagePlanItems.planId, planIds)))
    .orderBy(asc(fyhPackagePlanItems.createdAt));

  const itemsByPlan = new Map<string, PackagePlanDetailedItem[]>();
  for (const row of itemRows) {
    const list = itemsByPlan.get(row.planId) ?? [];
    list.push({
      id: row.id,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      quantity: row.quantity,
      retailUnitPaise: row.retailUnitPaise,
    });
    itemsByPlan.set(row.planId, list);
  }

  return plans.map((plan) => {
    const items = itemsByPlan.get(plan.id) ?? [];
    const normalValuePaise =
      plan.normalValuePaise > 0
        ? plan.normalValuePaise
        : computePackageNormalValuePaise(
            items.map((i) => ({ retailUnitPaise: i.retailUnitPaise, quantity: i.quantity })),
          );
    const discount = computePackageDiscount(normalValuePaise, plan.pricePaise);
    return {
      id: plan.id,
      name: plan.name,
      serviceId: plan.serviceId,
      totalSessions: plan.totalSessions,
      offerPricePaise: plan.pricePaise,
      normalValuePaise,
      validityDays: plan.validityDays,
      isActive: plan.isActive,
      items,
      ...discount,
    };
  });
}

export async function createPackagePlan(
  input: {
    name: string;
    offerPricePaise: number;
    validityDays: number | null;
    items: PackagePlanItemInput[];
  },
  ctx?: TenantContext | null,
) {
  ctx = await resolveTenantContextForService(ctx);
  const name = input.name.trim();
  if (!name) throw new Error('Package name is required');
  if (input.offerPricePaise < 0) throw new Error('Offer price cannot be negative');
  validatePlanItems(input.items);

  const serviceMap = await loadServicePriceMap(
    input.items.map((i) => i.serviceId),
    ctx,
  );
  for (const item of input.items) {
    if (!serviceMap.has(item.serviceId)) throw new Error('Service not found for package plan item');
  }

  const priced = input.items.map((item) => ({
    serviceId: item.serviceId,
    quantity: item.quantity,
    retailUnitPaise: serviceMap.get(item.serviceId)!.pricePaise,
  }));
  const normalValuePaise = computePackageNormalValuePaise(priced);
  const totalSessions = priced.reduce((sum, i) => sum + i.quantity, 0);
  const firstServiceId = priced[0]!.serviceId;
  const orgDefaults = tenantOrgDefaults(ctx);

  return hairDb.transaction(async (tx) => {
    const [plan] = await tx
      .insert(fyhPackagePlans)
      .values({
        ...orgDefaults,
        name,
        serviceId: firstServiceId,
        totalSessions,
        pricePaise: input.offerPricePaise,
        normalValuePaise,
        validityDays: input.validityDays,
        isActive: true,
      })
      .returning();

    if (!plan) throw new Error('Failed to create package plan');

    await tx.insert(fyhPackagePlanItems).values(
      priced.map((item) => ({
        ...orgDefaults,
        planId: plan.id,
        serviceId: item.serviceId,
        quantity: item.quantity,
      })),
    );

    return plan;
  });
}

export async function updatePackagePlan(
  planId: string,
  input: {
    name: string;
    offerPricePaise: number;
    validityDays: number | null;
    items: PackagePlanItemInput[];
  },
  ctx?: TenantContext | null,
) {
  ctx = await resolveTenantContextForService(ctx);
  const name = input.name.trim();
  if (!name) throw new Error('Package name is required');
  if (input.offerPricePaise < 0) throw new Error('Offer price cannot be negative');
  validatePlanItems(input.items);

  const [existing] = await hairDb
    .select({ id: fyhPackagePlans.id })
    .from(fyhPackagePlans)
    .where(and(orgFilter(fyhPackagePlans.organizationId, ctx), eq(fyhPackagePlans.id, planId)))
    .limit(1);
  if (!existing) throw new Error('Package plan not found');

  const serviceMap = await loadServicePriceMap(
    input.items.map((i) => i.serviceId),
    ctx,
  );
  for (const item of input.items) {
    if (!serviceMap.has(item.serviceId)) throw new Error('Service not found for package plan item');
  }

  const priced = input.items.map((item) => ({
    serviceId: item.serviceId,
    quantity: item.quantity,
    retailUnitPaise: serviceMap.get(item.serviceId)!.pricePaise,
  }));
  const normalValuePaise = computePackageNormalValuePaise(priced);
  const totalSessions = priced.reduce((sum, i) => sum + i.quantity, 0);
  const firstServiceId = priced[0]!.serviceId;
  const orgDefaults = tenantOrgDefaults(ctx);

  return hairDb.transaction(async (tx) => {
    const [plan] = await tx
      .update(fyhPackagePlans)
      .set({
        name,
        serviceId: firstServiceId,
        totalSessions,
        pricePaise: input.offerPricePaise,
        normalValuePaise,
        validityDays: input.validityDays,
      })
      .where(and(orgFilter(fyhPackagePlans.organizationId, ctx), eq(fyhPackagePlans.id, planId)))
      .returning();

    if (!plan) throw new Error('Package plan not found');

    await tx
      .delete(fyhPackagePlanItems)
      .where(and(orgFilter(fyhPackagePlanItems.organizationId, ctx), eq(fyhPackagePlanItems.planId, planId)));

    await tx.insert(fyhPackagePlanItems).values(
      priced.map((item) => ({
        ...orgDefaults,
        planId,
        serviceId: item.serviceId,
        quantity: item.quantity,
      })),
    );

    return plan;
  });
}

export async function deactivatePackagePlan(planId: string, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const [plan] = await hairDb
    .update(fyhPackagePlans)
    .set({ isActive: false })
    .where(and(orgFilter(fyhPackagePlans.organizationId, ctx), eq(fyhPackagePlans.id, planId)))
    .returning();
  if (!plan) throw new Error('Package plan not found');
  return plan;
}

export function allocatePlanEffectiveUnits(
  plan: Pick<PackagePlanDetailed, 'items' | 'offerPricePaise'>,
) {
  return allocateEffectiveUnitValues(
    plan.items.map((i) => ({
      serviceId: i.serviceId,
      quantity: i.quantity,
      retailUnitPaise: i.retailUnitPaise,
    })),
    plan.offerPricePaise,
  );
}
