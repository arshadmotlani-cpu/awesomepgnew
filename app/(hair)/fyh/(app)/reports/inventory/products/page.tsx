import { listStockSummary } from '@/src/hair/services/stock';
import { formatInrFromPaise } from '@/src/hair/lib/money';

export default async function ProductsInventoryReportPage() {
  const products = await listStockSummary();

  return (
    <div className="space-y-6">
      <div>
        <p className="fyh-section-eyebrow">Reports</p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">Inventory · Products</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Product-level stock and valuation snapshot.
        </p>
      </div>

      <div className="fyh-glass overflow-hidden">
        {products.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-fyh-text-muted">No products.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[color:var(--fyh-border)] bg-black/20 text-xs uppercase tracking-wide text-fyh-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Cost</th>
                <th className="px-4 py-3 font-medium">Retail</th>
                <th className="px-4 py-3 font-medium">Stock value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--fyh-border)]">
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-fyh-text-muted">{p.sku || '—'}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {p.stockQty} {p.unit}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatInrFromPaise(p.costPricePaise)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatInrFromPaise(p.sellingPricePaise)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-fyh-accent">
                    {formatInrFromPaise(Math.round(Number(p.stockQty) * p.costPricePaise))}
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
