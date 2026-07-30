import { PurchasesList } from '@/src/hair/components/inventory/PurchasesUi';
import { listPurchaseOrders } from '@/src/hair/services/purchases';

export default async function PurchasesPage() {
  const orders = await listPurchaseOrders();
  return <PurchasesList orders={orders} />;
}
