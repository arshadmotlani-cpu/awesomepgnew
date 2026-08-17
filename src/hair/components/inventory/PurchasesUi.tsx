'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import {
  createPurchaseOrderAction,
  receiveGrnAction,
  type InventoryActionState,
} from '@/src/hair/actions/inventory';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhProduct, FyhPurchaseOrder, FyhVendor } from '@/src/hair/db/schema';
import { formatInrFromPaise } from '@/src/hair/lib/money';

const initialState: InventoryActionState = {};
const fieldClass =
  'fyh-input w-full text-[0.8125rem] outline-none focus:border-fyh-accent/50';

type PoListItem = { po: FyhPurchaseOrder; vendorName: string };
type PoDetail = {
  po: FyhPurchaseOrder;
  vendorName: string;
  lines: Array<{
    line: { id: string; productId: string; quantityOrdered: number; unitCostPaise: number };
    productName: string;
  }>;
};

export function PurchasesList({ orders }: { orders: PoListItem[] }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="fyh-section-eyebrow">Inventory</p>
          <h1 className="fyh-display mt-1 font-semibold">Purchase orders</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Create POs and receive goods into stock
          </p>
        </div>
        <Link href="/inventory/purchases/new">
          <Button type="button">
            <Plus className="mr-2 h-4 w-4" />
            New PO
          </Button>
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="fyh-glass px-6 py-16 text-center">
          <p className="fyh-display text-xl font-semibold">No purchase orders</p>
          <p className="mt-2 text-sm text-fyh-text-muted">Create a PO to order from vendors.</p>
          <Link href="/inventory/purchases/new" className="mt-6 inline-block">
            <Button type="button">New PO</Button>
          </Link>
        </div>
      ) : (
        <div className="fyh-glass overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[color:var(--fyh-border)] bg-black/20 text-xs uppercase tracking-wide text-fyh-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">PO #</th>
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--fyh-border)]">
              {orders.map(({ po, vendorName }) => (
                <tr key={po.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <Link
                      href={`/inventory/purchases/${po.id}`}
                      className="font-medium hover:text-fyh-accent"
                    >
                      {po.poNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-fyh-text-muted">{vendorName}</td>
                  <td className="px-4 py-3 capitalize">{po.status}</td>
                  <td className="px-4 py-3 text-fyh-text-muted">
                    {new Date(po.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type LineDraft = {
  productId: string;
  quantity: number;
  unitCostRupees: number;
};

function PoLineEditor({
  products,
  lines,
  onChange,
}: {
  products: FyhProduct[];
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
}) {
  const addLine = () =>
    onChange([...lines, { productId: products[0]?.id ?? '', quantity: 1, unitCostRupees: 0 }]);

  const updateLine = (idx: number, patch: Partial<LineDraft>) => {
    onChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const removeLine = (idx: number) => onChange(lines.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      {lines.map((line, idx) => (
        <div key={idx} className="grid gap-2 sm:grid-cols-4">
          <select
            className={fieldClass}
            value={line.productId}
            onChange={(e) => updateLine(idx, { productId: e.target.value })}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Input
            type="number"
            min={0.001}
            step="any"
            placeholder="Qty"
            value={line.quantity}
            onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
          />
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="Unit cost ₹"
            value={line.unitCostRupees}
            onChange={(e) => updateLine(idx, { unitCostRupees: Number(e.target.value) })}
          />
          <Button type="button" variant="secondary" onClick={() => removeLine(idx)}>
            Remove
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={addLine}>
        Add line
      </Button>
    </div>
  );
}

export function PurchaseOrderForm({
  vendors,
  products,
}: {
  vendors: FyhVendor[];
  products: FyhProduct[];
}) {
  const [state, formAction, pending] = useActionState(createPurchaseOrderAction, initialState);
  const [lines, setLines] = useState<LineDraft[]>([
    { productId: products[0]?.id ?? '', quantity: 1, unitCostRupees: 0 },
  ]);

  return (
    <form action={formAction} className="fyh-glass space-y-4 p-5">
      <div className="space-y-2">
        <label className="fyh-label" htmlFor="vendorId">
          Vendor *
        </label>
        <select id="vendorId" name="vendorId" required className={fieldClass} defaultValue="">
          <option value="" disabled>
            Select vendor
          </option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-fyh-text-secondary">Lines</label>
        <PoLineEditor products={products} lines={lines} onChange={setLines} />
        <input
          type="hidden"
          name="linesJson"
          value={JSON.stringify(
            lines.map((l) => ({
              productId: l.productId,
              quantityOrdered: l.quantity,
              unitCostRupees: l.unitCostRupees,
            })),
          )}
        />
      </div>

      <div className="space-y-2">
        <label className="fyh-label" htmlFor="notes">
          Notes
        </label>
        <Input id="notes" name="notes" />
      </div>

      <label className="flex items-center gap-2 text-sm text-fyh-text-secondary">
        <input type="checkbox" name="markOrdered" className="rounded" />
        Mark as ordered immediately
      </label>

      {state.error ? <p className="text-sm text-fyh-danger">{state.error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || products.length === 0}>
          {pending ? 'Creating…' : 'Create PO'}
        </Button>
        <Link href="/inventory/purchases">
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}

export function PurchaseOrderDetail({
  detail,
  vendors,
  products,
}: {
  detail: PoDetail;
  vendors: FyhVendor[];
  products: FyhProduct[];
}) {
  const [state, formAction, pending] = useActionState(receiveGrnAction, initialState);
  const [lines, setLines] = useState<LineDraft[]>(
    detail.lines.map((l) => ({
      productId: l.line.productId,
      quantity: l.line.quantityOrdered,
      unitCostRupees: l.line.unitCostPaise / 100,
    })),
  );

  const canReceive = detail.po.status !== 'cancelled' && detail.po.status !== 'received';

  return (
    <div className="space-y-6">
      <div>
        <p className="fyh-section-eyebrow">PO</p>
        <h1 className="fyh-display mt-1 font-semibold">{detail.po.poNumber}</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          {detail.vendorName} · <span className="capitalize">{detail.po.status}</span>
        </p>
      </div>

      <div className="fyh-glass overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[color:var(--fyh-border)] bg-black/20 text-xs uppercase tracking-wide text-fyh-text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Qty ordered</th>
              <th className="px-4 py-3 font-medium">Unit cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--fyh-border)]">
            {detail.lines.map(({ line, productName }) => (
              <tr key={line.id}>
                <td className="px-4 py-3">
                  {productName}
                </td>
                <td className="px-4 py-3 tabular-nums">{line.quantityOrdered}</td>
                <td className="px-4 py-3 tabular-nums">
                  {formatInrFromPaise(line.unitCostPaise)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canReceive ? (
        <form action={formAction} className="fyh-glass space-y-4 p-5">
          <h2 className="fyh-display text-lg font-semibold">Receive goods (GRN)</h2>
          <input type="hidden" name="vendorId" value={detail.po.vendorId} />
          <input type="hidden" name="purchaseOrderId" value={detail.po.id} />
          <PoLineEditor products={products} lines={lines} onChange={setLines} />
          <input
            type="hidden"
            name="linesJson"
            value={JSON.stringify(
              lines.map((l) => ({
                productId: l.productId,
                quantityReceived: l.quantity,
                unitCostRupees: l.unitCostRupees,
              })),
            )}
          />
          <div className="space-y-2">
            <label className="fyh-label" htmlFor="notes">
              Notes
            </label>
            <Input id="notes" name="notes" />
          </div>
          {state.error ? <p className="text-sm text-fyh-danger">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-fyh-success">{state.success}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Receiving…' : 'Receive & update stock'}
          </Button>
        </form>
      ) : null}

      <Link href="/inventory/purchases">
        <Button type="button" variant="secondary">
          Back to list
        </Button>
      </Link>
    </div>
  );
}
