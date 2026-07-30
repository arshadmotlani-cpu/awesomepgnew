import { QuickSaleShell } from '@/src/hair/components/quick-sale/QuickSaleShell';
import { loadBillableCatalog } from '@/src/hair/domain/catalog/adapter';
import { getSalonSettings } from '@/src/hair/services/settings';

export default async function QuickSalePage() {
  const [billableItems, settings] = await Promise.all([
    loadBillableCatalog(),
    getSalonSettings(),
  ]);
  return (
    <QuickSaleShell
      billableItems={billableItems}
      googleReviewUrl={settings.googleReviewUrl}
    />
  );
}
