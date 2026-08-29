import { PurchaseRecordsList } from '@/src/hair/components/purchases/PurchasesUi';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { listPurchases } from '@/src/hair/services/purchaseBrain';

export default async function PurchasesPage() {
  const ctx = await getTenantContextForPage();
  const purchases = await listPurchases(200, ctx);
  return <PurchaseRecordsList purchases={purchases} />;
}
