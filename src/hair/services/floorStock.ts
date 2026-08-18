import { desc, eq, isNull, and } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhBrands, fyhFloorIssues, fyhProducts } from '@/src/hair/db/schema';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

export async function listOpenFloorIssues(ctx?: TenantContext | null) {
  return hairDb
    .select({
      issue: fyhFloorIssues,
      productName: fyhProducts.name,
      brandName: fyhBrands.name,
      productType: fyhProducts.productType,
    })
    .from(fyhFloorIssues)
    .innerJoin(fyhProducts, eq(fyhProducts.id, fyhFloorIssues.productId))
    .innerJoin(fyhBrands, eq(fyhBrands.id, fyhProducts.brandId))
    .where(
      and(
        orgFilter(fyhFloorIssues.organizationId, ctx),
        locationFilter(fyhFloorIssues.locationId, ctx),
        isNull(fyhFloorIssues.returnedAt),
      ),
    )
    .orderBy(desc(fyhFloorIssues.issuedAt));
}
