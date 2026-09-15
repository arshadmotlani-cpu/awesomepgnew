import type { FyhService } from '@/src/hair/db/schema';
import type { ProductWithBrand } from '@/src/hair/services/products';
import type { BillableItem, BillableItemType } from '@/src/hair/domain/catalog/types';
import { staffModeForType } from '@/src/hair/domain/catalog/types';
import { SALON_GST_BPS } from '@/src/hair/lib/taxConfig';
import { listMembershipPlans, listPackagePlans } from '@/src/hair/services/loyaltyOps';
import { listBookableRetailProducts } from '@/src/hair/services/products';
import { listBookableServices } from '@/src/hair/services/salonServices';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';

/** Map a Configuration catalog service row to a Quick Sale billable item (no duplicate catalog). */
export function mapServiceToBillableItem(service: FyhService): BillableItem {
  return {
    id: service.id,
    type: 'service',
    name: service.name,
    code: service.code,
    sellingPricePaise: service.pricePaise,
    gstBps: service.gstBps,
    category: service.category,
    durationMinutes: service.durationMinutes,
    staffMode: staffModeForType('service'),
    active: service.isActive,
  };
}

/** Map Configuration → Products row to Quick Sale billable item. */
export function mapProductToBillableItem(product: ProductWithBrand): BillableItem {
  return {
    id: product.id,
    type: 'product',
    name: product.name,
    code: null,
    sellingPricePaise: product.sellingPricePaise,
    gstBps: SALON_GST_BPS,
    category: product.category ?? product.brandName,
    staffMode: staffModeForType('product'),
    active: product.isActive,
  };
}

/**
 * Billable catalog for POS / Quick Sale.
 * Services/products: same SSOT as Configuration (`listBookableServices` / `listBookableRetailProducts`).
 */
export async function loadBillableCatalog(ctx?: TenantContext | null): Promise<BillableItem[]> {
  ctx = await resolveTenantContextForService(ctx);
  const [serviceRows, productRows, packages, memberships] = await Promise.all([
    listBookableServices(ctx),
    listBookableRetailProducts(ctx),
    listPackagePlans(ctx),
    listMembershipPlans(ctx),
  ]);

  const items: BillableItem[] = [
    ...serviceRows.map(mapServiceToBillableItem),
    ...productRows.map(mapProductToBillableItem),
  ];
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
  ctx = await resolveTenantContextForService(ctx);
  const catalog = await loadBillableCatalog(ctx);
  return catalog.find((c) => c.type === type && c.id === id) ?? null;
}
