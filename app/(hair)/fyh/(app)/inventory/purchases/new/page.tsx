import { PurchaseOrderForm } from '@/src/hair/components/inventory/PurchasesUi';
import { listProducts } from '@/src/hair/services/products';
import { listVendors } from '@/src/hair/services/vendors';

export default async function NewPurchasePage() {
  const [vendors, products] = await Promise.all([
    listVendors({ status: 'active' }),
    listProducts({ status: 'active' }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <p className="fyh-section-eyebrow">
          Inventory
        </p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">New purchase order</h1>
      </div>
      {vendors.length === 0 ? (
        <div className="fyh-glass px-6 py-12 text-center text-sm text-fyh-text-muted">
          Add a vendor before creating a purchase order.
        </div>
      ) : products.length === 0 ? (
        <div className="fyh-glass px-6 py-12 text-center text-sm text-fyh-text-muted">
          Add products before creating a purchase order.
        </div>
      ) : (
        <PurchaseOrderForm vendors={vendors} products={products} />
      )}
    </div>
  );
}
