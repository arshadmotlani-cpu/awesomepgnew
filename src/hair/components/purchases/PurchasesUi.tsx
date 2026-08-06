'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, X } from 'lucide-react';
import {
  createPurchaseAction,
  type PurchaseActionState,
} from '@/src/hair/actions/purchases';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhProduct, FyhPurchase, FyhVendor, FyhVendorPayable } from '@/src/hair/db/schema';
import {
  FYH_EXPENSE_PAYMENT_LABELS,
  FYH_EXPENSE_PAYMENT_METHODS,
} from '@/src/hair/lib/expenseCategories';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { explainPurchase } from '@/src/hair/lib/purchaseExplain';

const initialState: PurchaseActionState = {};
const fieldClass =
  'fyh-input w-full text-[0.8125rem] outline-none focus:border-fyh-accent/50';

type PurchaseListRow = {
  purchase: FyhPurchase;
  vendorName: string;
  balancePaise: number | null;
  payableStatus: string | null;
};

export function PurchaseRecordsList({ purchases }: { purchases: PurchaseListRow[] }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="fyh-section-eyebrow">Procurement</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">Purchases</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Record vendor purchases — stock, payable, and expense created together
          </p>
        </div>
        <Link href="/purchases/new">
          <Button type="button">
            <Plus className="mr-2 h-4 w-4" />
            Record purchase
          </Button>
        </Link>
      </div>

      {purchases.length === 0 ? (
        <div className="fyh-glass px-6 py-16 text-center">
          <p className="fyh-display text-xl font-semibold">No purchases yet</p>
          <p className="mt-2 text-sm text-fyh-text-muted">
            Record a purchase to receive stock and open a vendor payable.
          </p>
          <Link href="/purchases/new" className="mt-6 inline-block">
            <Button type="button">Record purchase</Button>
          </Link>
        </div>
      ) : (
        <div className="fyh-glass overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Purchase #</th>
                <th>Vendor</th>
                <th>Date</th>
                <th>Total</th>
                <th>Outstanding</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--fyh-border)]">
              {purchases.map(({ purchase, vendorName, balancePaise, payableStatus }) => (
                <tr key={purchase.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <Link
                      href={`/purchases/${purchase.id}`}
                      className="font-medium hover:text-fyh-accent"
                    >
                      {purchase.purchaseNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-fyh-text-muted">{vendorName}</td>
                  <td className="px-4 py-3 tabular-nums text-fyh-text-muted">
                    {purchase.purchaseDate}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatInrFromPaise(purchase.totalPaise)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-fyh-warning">
                    {balancePaise != null ? formatInrFromPaise(balancePaise) : '—'}
                  </td>
                  <td className="px-4 py-3 capitalize text-fyh-text-muted">
                    {payableStatus ?? purchase.status}
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

type LineDraft = { productId: string; quantity: number; unitCostRupees: number };

function PurchaseLineEditor({
  products,
  lines,
  onChange,
}: {
  products: FyhProduct[];
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
}) {
  return (
    <div className="space-y-3">
      {lines.map((line, idx) => (
        <div key={idx} className="grid gap-2 rounded-lg border border-[color:var(--fyh-border)] p-3 sm:grid-cols-4">
          <select
            className={fieldClass}
            value={line.productId}
            onChange={(e) =>
              onChange(lines.map((l, i) => (i === idx ? { ...l, productId: e.target.value } : l)))
            }
          >
            <option value="" disabled>
              Product
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Input
            type="number"
            min={0}
            step="any"
            placeholder="Qty"
            value={line.quantity || ''}
            onChange={(e) =>
              onChange(
                lines.map((l, i) =>
                  i === idx ? { ...l, quantity: Number(e.target.value) } : l,
                ),
              )
            }
          />
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="Unit cost ₹"
            value={line.unitCostRupees || ''}
            onChange={(e) =>
              onChange(
                lines.map((l, i) =>
                  i === idx ? { ...l, unitCostRupees: Number(e.target.value) } : l,
                ),
              )
            }
          />
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm tabular-nums text-fyh-text-muted">
              {formatInrFromPaise(Math.round(line.quantity * line.unitCostRupees * 100))}
            </span>
            {lines.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(lines.filter((_, i) => i !== idx))}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() =>
          onChange([...lines, { productId: products[0]?.id ?? '', quantity: 1, unitCostRupees: 0 }])
        }
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add line
      </Button>
    </div>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PurchaseRecordForm({
  vendors,
  products,
}: {
  vendors: FyhVendor[];
  products: FyhProduct[];
}) {
  const [state, formAction, pending] = useActionState(createPurchaseAction, initialState);
  const [lines, setLines] = useState<LineDraft[]>([
    { productId: products[0]?.id ?? '', quantity: 1, unitCostRupees: 0 },
  ]);
  const linesJson = useMemo(() => JSON.stringify(lines), [lines]);
  const totalRupees = lines.reduce((sum, l) => sum + l.quantity * l.unitCostRupees, 0);

  return (
    <form action={formAction} className="fyh-glass space-y-4 p-5">
      <input type="hidden" name="linesJson" value={linesJson} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
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
          <label className="fyh-label" htmlFor="purchaseDate">
            Purchase date *
          </label>
          <Input id="purchaseDate" name="purchaseDate" type="date" required defaultValue={todayIso()} />
        </div>
        <div className="space-y-2">
          <label className="fyh-label" htmlFor="vendorInvoiceRef">
            Vendor invoice #
          </label>
          <Input id="vendorInvoiceRef" name="vendorInvoiceRef" placeholder="Optional" />
        </div>
        <div className="space-y-2">
          <label className="fyh-label" htmlFor="paymentMethod">
            Payment method
          </label>
          <select id="paymentMethod" name="paymentMethod" className={fieldClass} defaultValue="online">
            {FYH_EXPENSE_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {FYH_EXPENSE_PAYMENT_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <span className="fyh-label">Products</span>
          <PurchaseLineEditor products={products} lines={lines} onChange={setLines} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label className="fyh-label" htmlFor="notes">
            Notes
          </label>
          <textarea id="notes" name="notes" rows={2} className={fieldClass} />
        </div>
        <div className="sm:col-span-2 text-sm">
          <span className="text-fyh-text-muted">Total: </span>
          <span className="font-semibold tabular-nums">{formatInrFromPaise(Math.round(totalRupees * 100))}</span>
        </div>
      </div>

      {state.error ? <p className="text-sm text-fyh-danger">{state.error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !vendors.length || !products.length}>
          {pending ? 'Saving…' : 'Record purchase'}
        </Button>
        <Link href="/purchases">
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}

export function PurchaseDetailView({
  detail,
}: {
  detail: {
    purchase: FyhPurchase;
    vendorName: string;
    lines: Array<{
      line: { quantity: number; unitCostPaise: number; lineTotalPaise: number };
      productName: string;
      brandName: string;
    }>;
    payable: FyhVendorPayable | null;
  };
}) {
  const summary = explainPurchase({
    purchase: detail.purchase,
    vendorName: detail.vendorName,
    payable: detail.payable,
  });

  return (
    <div className="space-y-4">
      <div className="fyh-glass p-4">
        <Link href="/purchases" className="text-sm text-fyh-accent hover:underline">
          ← Back
        </Link>
        <h1 className="fyh-display mt-2 text-2xl font-semibold">{detail.purchase.purchaseNumber}</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">{detail.vendorName}</p>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-fyh-text-muted">Date</p>
            <p className="font-medium">{summary.purchaseDate}</p>
          </div>
          <div>
            <p className="text-fyh-text-muted">Total</p>
            <p className="font-medium tabular-nums">{formatInrFromPaise(summary.totalPaise)}</p>
          </div>
          <div>
            <p className="text-fyh-text-muted">Outstanding</p>
            <p className="font-medium tabular-nums text-fyh-warning">
              {formatInrFromPaise(summary.balancePaise)}
            </p>
          </div>
          <div>
            <p className="text-fyh-text-muted">Payable status</p>
            <p className="font-medium capitalize">{summary.payableStatus}</p>
          </div>
        </div>
        {detail.purchase.vendorInvoiceRef ? (
          <p className="mt-2 text-sm text-fyh-text-muted">
            Vendor invoice: {detail.purchase.vendorInvoiceRef}
          </p>
        ) : null}
      </div>

      <div className="fyh-glass overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>Product</th>
              <th>Brand</th>
              <th>Qty</th>
              <th>Unit cost</th>
              <th>Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--fyh-border)]">
            {detail.lines.map(({ line, productName, brandName }) => (
              <tr key={`${productName}-${line.unitCostPaise}`}>
                <td className="px-4 py-3 font-medium">{productName}</td>
                <td className="px-4 py-3 text-fyh-text-muted">{brandName}</td>
                <td className="px-4 py-3 tabular-nums">{line.quantity}</td>
                <td className="px-4 py-3 tabular-nums">
                  {formatInrFromPaise(line.unitCostPaise)}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {formatInrFromPaise(line.lineTotalPaise)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
