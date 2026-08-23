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
import { SALON_GST_BPS } from '@/src/hair/lib/taxConfig';
import { listMembershipPlans, listPackagePlans } from '@/src/hair/services/loyaltyOps';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter } from '@/src/hair/lib/tenant/filters';

/**
 * Billable catalog for POS / Quick Sale.
 * Always org-scoped (Phase C): never returns another salon's catalog rows.
 */
export async function loadBillableCatalog(ctx?: TenantContext | null): Promise<BillableItem[]> {
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
      .where(and(orgFilter(fyhServices.organizationId, ctx), eq(fyhServices.isActive, true)))
      .orderBy(asc(fyhServices.name)),
    hairDb
      .select({
        id: fyhProducts.id,
        name: fyhProducts.name,
        category: fyhProducts.category,
        pricePaise: fyhProducts.sellingPricePaise,
        isActive: fyhProducts.isActive,
      })
      .from(fyhProducts)
      .where(
        and(
          orgFilter(fyhProducts.organizationId, ctx),
          eq(fyhProducts.isActive, true),
          eq(fyhProducts.productType, 'retail'),
        ),
      )
      .orderBy(asc(fyhProducts.name)),
    listPackagePlans(ctx),
    listMembershipPlans(ctx),
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
      code: null,
      sellingPricePaise: p.pricePaise,
      gstBps: SALON_GST_BPS,
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
  ctx?: TenantContext | null,
): Promise<BillableItem | null> {
  const catalog = await loadBillableCatalog(ctx);
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
