import { listOpenFloorIssues } from '@/src/hair/services/floorStock';

export default async function InventoryOnFloorPage() {
  const issues = await listOpenFloorIssues();

  return (
    <div className="space-y-4">
      <div>
        <p className="fyh-section-eyebrow">Inventory</p>
        <h1 className="fyh-display mt-1 text-2xl font-semibold">On Floor</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Products issued for salon use — stock issue and return coming in Phase 2
        </p>
      </div>

      <div className="fyh-glass overflow-hidden">
        {issues.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-fyh-text-muted">
            No products on floor right now.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Product</th>
                <th>Brand</th>
                <th>Quantity On Floor</th>
                <th>Issued Date</th>
                <th>Issued By</th>
                <th>Return</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--fyh-border)]">
              {issues.map(({ issue, productName, brandName }) => (
                <tr key={issue.id}>
                  <td className="px-4 py-3 font-medium">{productName}</td>
                  <td className="px-4 py-3 text-fyh-text-muted">{brandName}</td>
                  <td className="px-4 py-3 tabular-nums">{issue.quantity}</td>
                  <td className="px-4 py-3 tabular-nums text-fyh-text-muted">
                    {issue.issuedAt.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-fyh-text-muted">{issue.issuedByName}</td>
                  <td className="px-4 py-3 text-fyh-text-muted">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
