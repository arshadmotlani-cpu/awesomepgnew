import { listStockSummary } from '@/src/hair/services/stock';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { productTypeLabel } from '@/src/hair/lib/productTypes';

export default async function InventoryStockPage() {
  const products = await listStockSummary();

  return (
    <div className="space-y-4">
      <div>
        <p className="fyh-section-eyebrow">Inventory</p>
        <h1 className="fyh-display mt-1 text-2xl font-semibold">Stock</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Products stored in inventory
        </p>
      </div>

      <div className="fyh-glass overflow-hidden">
        {products.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-fyh-text-muted">
            No products in stock yet.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Product</th>
                <th>Brand</th>
                <th>Professional / Retail</th>
                <th>Available Qty</th>
                <th>Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--fyh-border)]">
              {products.map((p) => {
                const valuePaise = Math.round(Number(p.stockQty) * Number(p.costPricePaise));
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-fyh-text-muted">{p.brandName}</td>
                    <td className="px-4 py-3 text-fyh-text-muted">
                      {productTypeLabel(p.productType)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{p.stockQty}</td>
                    <td className="px-4 py-3 tabular-nums">{formatInrFromPaise(valuePaise)}</td>
                    <td className="px-4 py-3 text-fyh-success">In stock</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
