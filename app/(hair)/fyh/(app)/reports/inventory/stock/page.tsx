import { listMovements, listStockSummary } from '@/src/hair/services/stock';
import { formatInrFromPaise } from '@/src/hair/lib/money';

export default async function StockReportPage() {
  const [products, movements] = await Promise.all([
    listStockSummary(),
    listMovements({ limit: 100 }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="fyh-section-eyebrow">Reports</p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">Inventory · Stock movement</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Current on-hand levels and recent ledger entries.
        </p>
      </div>

      <div className="fyh-glass overflow-hidden">
        <h2 className="border-b border-[color:var(--fyh-border)] px-4 py-3 text-sm font-semibold">
          On-hand summary
        </h2>
        {products.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-fyh-text-muted">No products.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[color:var(--fyh-border)] bg-black/20 text-xs uppercase tracking-wide text-fyh-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Value (cost)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--fyh-border)]">
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 tabular-nums">{p.stockQty}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatInrFromPaise(Math.round(Number(p.stockQty) * p.costPricePaise))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="fyh-glass overflow-hidden">
        <h2 className="border-b border-[color:var(--fyh-border)] px-4 py-3 text-sm font-semibold">
          Recent movements
        </h2>
        {movements.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-fyh-text-muted">No movements.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[color:var(--fyh-border)] bg-black/20 text-xs uppercase tracking-wide text-fyh-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Delta</th>
                <th className="px-4 py-3 font-medium">After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--fyh-border)]">
              {movements.map(({ movement, productName }) => (
                <tr key={movement.id}>
                  <td className="px-4 py-3 text-fyh-text-muted">
                    {new Date(movement.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{productName}</td>
                  <td className="px-4 py-3 capitalize">{movement.movementType}</td>
                  <td className="px-4 py-3 tabular-nums">{movement.quantityDelta}</td>
                  <td className="px-4 py-3 tabular-nums">{movement.quantityAfter ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
