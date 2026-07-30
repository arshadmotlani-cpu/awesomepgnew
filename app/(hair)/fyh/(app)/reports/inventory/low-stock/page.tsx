import { listLowStockProducts } from '@/src/hair/services/stock';
import { formatInrFromPaise } from '@/src/hair/lib/money';

export default async function LowStockReportPage() {
  const products = await listLowStockProducts();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-fyh-accent">Reports</p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">Inventory · Low stock</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Products at or below their reorder level.
        </p>
      </div>

      <div className="fyh-glass overflow-hidden">
        {products.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-fyh-text-muted">
            All products are above reorder level.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[color:var(--fyh-border)] bg-black/20 text-xs uppercase tracking-wide text-fyh-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">On hand</th>
                <th className="px-4 py-3 font-medium">Reorder</th>
                <th className="px-4 py-3 font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--fyh-border)]">
              {products.map((p) => (
                <tr key={p.id} className="bg-fyh-warning/10">
                  <td className="px-4 py-3 font-medium text-fyh-warning">{p.name}</td>
                  <td className="px-4 py-3 text-fyh-text-muted">{p.sku || '—'}</td>
                  <td className="px-4 py-3 tabular-nums font-semibold text-fyh-warning">
                    {p.stockQty} {p.unit}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{p.reorderLevel}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatInrFromPaise(p.sellingPricePaise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
