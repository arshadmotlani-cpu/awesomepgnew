import { AdjustmentForm } from '@/src/hair/components/inventory/AdjustmentsUi';
import { listProducts } from '@/src/hair/services/products';

export default async function NewAdjustmentPage() {
  const products = await listProducts({ status: 'active' });

  return (
    <div className="space-y-4">
      <div>
        <p className="fyh-section-eyebrow">
          Inventory
        </p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">New adjustment</h1>
      </div>
      {products.length === 0 ? (
        <div className="fyh-glass px-6 py-12 text-center text-sm text-fyh-text-muted">
          Add products before creating adjustments.
        </div>
      ) : (
        <AdjustmentForm products={products} />
      )}
    </div>
  );
}
