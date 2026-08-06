import { PurchaseRecordsList } from '@/src/hair/components/purchases/PurchasesUi';
import { listPurchases } from '@/src/hair/services/purchaseBrain';

export default async function PurchasesPage() {
  const purchases = await listPurchases();
  return <PurchaseRecordsList purchases={purchases} />;
}
