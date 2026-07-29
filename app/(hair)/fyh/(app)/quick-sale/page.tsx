import { QuickSaleShell } from '@/src/hair/components/quick-sale/QuickSaleShell';
import { loadQuickSaleCatalog } from '@/src/hair/services/quickSale';

export default async function QuickSalePage() {
  const catalog = await loadQuickSaleCatalog();
  return <QuickSaleShell catalog={catalog} />;
}
