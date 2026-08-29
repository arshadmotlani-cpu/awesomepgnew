import Link from 'next/link';
import { PurchaseRecordForm } from '@/src/hair/components/purchases/PurchasesUi';
import { Button } from '@/src/hair/components/ui/button';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { listProducts } from '@/src/hair/services/products';
import { listVendors } from '@/src/hair/services/vendors';

export default async function NewPurchasePage() {
  const ctx = await getTenantContextForPage();
  const [vendors, products] = await Promise.all([
    listVendors({ status: 'active' }, ctx),
    listProducts({ status: 'active' }, ctx),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="fyh-section-eyebrow">Purchases</p>
          <h1 className="fyh-display mt-1 text-2xl font-semibold">Record purchase</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Creates stock inward, vendor payable, and expense in one step
          </p>
        </div>
        <Link href="/purchases">
          <Button type="button" variant="ghost">
            Back
          </Button>
        </Link>
      </div>
      <PurchaseRecordForm vendors={vendors} products={products} />
    </div>
  );
}
