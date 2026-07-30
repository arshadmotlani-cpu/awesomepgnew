'use client';

import type { FyhStockMovement } from '@/src/hair/db/schema';

type MovementRow = {
  movement: FyhStockMovement;
  productName: string;
  productSku: string | null;
};

export function MovementsList({ movements }: { movements: MovementRow[] }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-fyh-accent">
          Inventory
        </p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">Stock movements</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Append-only ledger of all stock changes
        </p>
      </div>

      {movements.length === 0 ? (
        <div className="fyh-glass px-6 py-16 text-center">
          <p className="fyh-display text-xl font-semibold">No movements yet</p>
          <p className="mt-2 text-sm text-fyh-text-muted">
            Movements appear when stock is purchased, sold, or adjusted.
          </p>
        </div>
      ) : (
        <div className="fyh-glass overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[color:var(--fyh-border)] bg-black/20 text-xs uppercase tracking-wide text-fyh-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Delta</th>
                <th className="px-4 py-3 font-medium">After</th>
                <th className="px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--fyh-border)]">
              {movements.map(({ movement, productName, productSku }) => (
                <tr key={movement.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3 text-fyh-text-muted">
                    {new Date(movement.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {productName}
                    {productSku ? (
                      <span className="ml-2 text-xs text-fyh-text-muted">{productSku}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 capitalize">{movement.movementType}</td>
                  <td
                    className={`px-4 py-3 tabular-nums font-medium ${
                      Number(movement.quantityDelta) >= 0
                        ? 'text-fyh-success'
                        : 'text-fyh-danger'
                    }`}
                  >
                    {Number(movement.quantityDelta) >= 0 ? '+' : ''}
                    {movement.quantityDelta}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{movement.quantityAfter ?? '—'}</td>
                  <td className="px-4 py-3 text-fyh-text-muted">{movement.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
