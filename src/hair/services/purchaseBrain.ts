import { desc, eq, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhPurchases, fyhVendorPayables, fyhVendors } from '@/src/hair/db/schema';
import { getPurchaseEngineDetail } from '@/src/hair/services/purchaseEngine';

export { explainPurchase } from '@/src/hair/lib/purchaseExplain';

export async function listPurchases(limit = 200) {
  return hairDb
    .select({
      purchase: fyhPurchases,
      vendorName: fyhVendors.name,
      balancePaise: fyhVendorPayables.balancePaise,
      payableStatus: fyhVendorPayables.status,
    })
    .from(fyhPurchases)
    .innerJoin(fyhVendors, eq(fyhVendors.id, fyhPurchases.vendorId))
    .leftJoin(fyhVendorPayables, eq(fyhVendorPayables.purchaseId, fyhPurchases.id))
    .orderBy(desc(fyhPurchases.purchaseDate), desc(fyhPurchases.createdAt))
    .limit(limit);
}

export async function getPurchase(purchaseId: string) {
  return getPurchaseEngineDetail(purchaseId);
}

export async function getVendorOutstanding(vendorId: string) {
  const [row] = await hairDb
    .select({
      outstandingPaise: sql<number>`coalesce(sum(${fyhVendorPayables.balancePaise}), 0)`,
    })
    .from(fyhVendorPayables)
    .where(eq(fyhVendorPayables.vendorId, vendorId));
  return Number(row?.outstandingPaise ?? 0);
}

