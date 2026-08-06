import { desc, eq, isNull } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhBrands, fyhFloorIssues, fyhProducts } from '@/src/hair/db/schema';

export async function listOpenFloorIssues() {
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
    .where(isNull(fyhFloorIssues.returnedAt))
    .orderBy(desc(fyhFloorIssues.issuedAt));
}
