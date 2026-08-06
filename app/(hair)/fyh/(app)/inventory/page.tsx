import { listStockSummary } from '@/src/hair/services/stock';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { productTypeLabel } from '@/src/hair/lib/productTypes';
import { cn } from '@/src/hair/lib/utils';

export default async function InventoryPage() {
  const products = await listStockSummary();

  return (
    <div className="space-y-6">
      <div>
        <p className="fyh-section-eyebrow">Stock</p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">Overview</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          On-hand quantities with low-stock highlights at or below minimum stock.
        </p>
      </div>

      <div className="fyh-glass overflow-hidden">
        {products.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-fyh-text-muted">
            No products yet. Add products to track stock.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[color:var(--fyh-border)] bg-black/20 text-xs uppercase tracking-wide text-fyh-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Min</th>
                <th className="px-4 py-3 font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--fyh-border)]">
              {products.map((p) => {
                const low = Number(p.minStock) > 0 && Number(p.stockQty) <= Number(p.minStock);
                return (
                  <tr key={p.id} className={cn(low && 'bg-fyh-warning/10')}>
                    <td className="px-4 py-3 font-medium">
                      {p.name}
                      {low ? (
                        <span className="ml-2 text-xs font-semibold text-fyh-warning">
                          Low stock
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-fyh-text-muted">
                      {productTypeLabel(p.productType)}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 tabular-nums',
                        low ? 'font-semibold text-fyh-warning' : '',
                      )}
                    >
                      {p.stockQty}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-fyh-text-muted">{p.minStock}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {p.productType === 'retail'
                        ? formatInrFromPaise(p.sellingPricePaise)
                        : '—'}
                    </td>
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
