'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import {
  createAdjustmentAction,
  type InventoryActionState,
} from '@/src/hair/actions/inventory';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhProduct, FyhStockAdjustment } from '@/src/hair/db/schema';

const initialState: InventoryActionState = {};
const fieldClass =
  'fyh-input w-full text-[0.8125rem] outline-none focus:border-fyh-accent/50';

type AdjustmentRow = {
  adjustment: FyhStockAdjustment;
  productName: string;
  productSku: string | null;
};

export function AdjustmentsList({ adjustments }: { adjustments: AdjustmentRow[] }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="fyh-section-eyebrow">Inventory</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">Stock adjustments</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Manual corrections for counts, damage, or shrinkage
          </p>
        </div>
        <Link href="/inventory/adjustments/new">
          <Button type="button">
            <Plus className="mr-2 h-4 w-4" />
            New adjustment
          </Button>
        </Link>
      </div>

      {adjustments.length === 0 ? (
        <div className="fyh-glass px-6 py-16 text-center">
          <p className="fyh-display text-xl font-semibold">No adjustments yet</p>
          <Link href="/inventory/adjustments/new" className="mt-6 inline-block">
            <Button type="button">New adjustment</Button>
          </Link>
        </div>
      ) : (
        <div className="fyh-glass overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[color:var(--fyh-border)] bg-black/20 text-xs uppercase tracking-wide text-fyh-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Delta</th>
                <th className="px-4 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--fyh-border)]">
              {adjustments.map(({ adjustment, productName, productSku }) => (
                <tr key={adjustment.id}>
                  <td className="px-4 py-3 text-fyh-text-muted">
                    {new Date(adjustment.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {productName}
                    {productSku ? (
                      <span className="ml-2 text-xs text-fyh-text-muted">{productSku}</span>
                    ) : null}
                  </td>
                  <td
                    className={`px-4 py-3 tabular-nums font-medium ${
                      Number(adjustment.quantityDelta) >= 0
                        ? 'text-fyh-success'
                        : 'text-fyh-danger'
                    }`}
                  >
                    {Number(adjustment.quantityDelta) >= 0 ? '+' : ''}
                    {adjustment.quantityDelta}
                  </td>
                  <td className="px-4 py-3 text-fyh-text-muted">{adjustment.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AdjustmentForm({ products }: { products: FyhProduct[] }) {
  const [state, formAction, pending] = useActionState(createAdjustmentAction, initialState);

  return (
    <form action={formAction} className="fyh-glass space-y-4 p-5">
      <div className="space-y-2">
        <label className="fyh-label" htmlFor="productId">
          Product *
        </label>
        <select id="productId" name="productId" required className={fieldClass} defaultValue="">
          <option value="" disabled>
            Select product
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.stockQty} {p.unit})
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label className="fyh-label" htmlFor="quantityDelta">
          Quantity delta *
        </label>
        <Input
          id="quantityDelta"
          name="quantityDelta"
          type="number"
          step="any"
          required
          placeholder="Use negative to reduce stock"
        />
      </div>
      <div className="space-y-2">
        <label className="fyh-label" htmlFor="reason">
          Reason *
        </label>
        <Input id="reason" name="reason" required placeholder="e.g. Physical count correction" />
      </div>
      <div className="space-y-2">
        <label className="fyh-label" htmlFor="notes">
          Notes
        </label>
        <Input id="notes" name="notes" />
      </div>

      {state.error ? <p className="text-sm text-fyh-danger">{state.error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || products.length === 0}>
          {pending ? 'Saving…' : 'Apply adjustment'}
        </Button>
        <Link href="/inventory/adjustments">
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}
