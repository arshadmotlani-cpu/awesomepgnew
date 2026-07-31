import { and, asc, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhProducts,
  fyhServiceCategories,
  fyhServices,
} from '@/src/hair/db/schema';
import type { BillableItem, BillableItemType } from '@/src/hair/domain/catalog/types';
import { staffModeForType } from '@/src/hair/domain/catalog/types';
import { shouldHideServiceFromBillable } from '@/src/hair/lib/serviceCatalogHygiene';
import { listMembershipPlans, listPackagePlans } from '@/src/hair/services/loyaltyOps';

export async function loadBillableCatalog(): Promise<BillableItem[]> {
  const [services, products, packages, memberships] = await Promise.all([
    hairDb
      .select({
        id: fyhServices.id,
        name: fyhServices.name,
        code: fyhServices.code,
        category: fyhServices.category,
        pricePaise: fyhServices.pricePaise,
        gstBps: fyhServices.gstBps,
        isActive: fyhServices.isActive,
      })
      .from(fyhServices)
      .leftJoin(fyhServiceCategories, eq(fyhServices.category, fyhServiceCategories.name))
      .where(eq(fyhServices.isActive, true))
      .orderBy(asc(fyhServices.name)),
    hairDb
      .select({
        id: fyhProducts.id,
        name: fyhProducts.name,
        sku: fyhProducts.sku,
        category: fyhProducts.category,
        pricePaise: fyhProducts.sellingPricePaise,
        gstBps: fyhProducts.gstBps,
        isActive: fyhProducts.isActive,
      })
      .from(fyhProducts)
      .where(and(eq(fyhProducts.isActive, true), eq(fyhProducts.isRetail, true)))
      .orderBy(asc(fyhProducts.name)),
    listPackagePlans(),
    listMembershipPlans(),
  ]);

  const items: BillableItem[] = [];

  for (const s of services) {
    if (shouldHideServiceFromBillable(s.name, s.code)) continue;
    items.push({
      id: s.id,
      type: 'service',
      name: s.name,
      code: s.code,
      sellingPricePaise: s.pricePaise,
      gstBps: s.gstBps,
      category: s.category,
      staffMode: staffModeForType('service'),
      active: s.isActive,
    });
  }
  for (const p of products) {
    items.push({
      id: p.id,
      type: 'product',
      name: p.name,
      code: p.sku,
      sellingPricePaise: p.pricePaise,
      gstBps: p.gstBps,
      category: p.category,
      staffMode: staffModeForType('product'),
      active: p.isActive,
    });
  }
  for (const p of packages) {
    items.push({
      id: p.id,
      type: 'package',
      name: p.name,
      code: null,
      sellingPricePaise: p.pricePaise,
      gstBps: 0,
      category: 'Package',
      staffMode: staffModeForType('package'),
      active: p.isActive,
    });
  }
  for (const m of memberships) {
    items.push({
      id: m.id,
      type: 'membership',
      name: m.name,
      code: null,
      sellingPricePaise: m.pricePaise,
      gstBps: 0,
      category: 'Membership',
      staffMode: staffModeForType('membership'),
      active: m.isActive,
    });
  }

  return items;
}

export async function resolveBillableItem(
  type: BillableItemType,
  id: string,
): Promise<BillableItem | null> {
  const catalog = await loadBillableCatalog();
  return catalog.find((c) => c.type === type && c.id === id) ?? null;
}

export function billableItemToSnapshot(item: BillableItem) {
  return {
    name: item.name,
    code: item.code,
    unitSellingPricePaise: item.sellingPricePaise,
    gstBps: item.gstBps,
    staffMode: item.staffMode,
    category: item.category,
  };
}
