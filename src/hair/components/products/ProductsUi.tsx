'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import {
  archiveProductAction,
  createProductAction,
  updateProductAction,
  type ProductActionState,
} from '@/src/hair/actions/products';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhProduct } from '@/src/hair/db/schema';
import { formatInrFromPaise } from '@/src/hair/lib/money';

const initialState: ProductActionState = {};

const fieldClass =
  'fyh-input w-full text-[0.8125rem] outline-none focus:border-fyh-accent/50';

export function ProductsList({
  products,
  q,
  status,
}: {
  products: FyhProduct[];
  q?: string;
  status?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="fyh-section-eyebrow">Retail</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">Products</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Retail and consumable products for billing and service kits
          </p>
        </div>
        <Link href="/products/new">
          <Button type="button">
            <Plus className="mr-2 h-4 w-4" />
            Add product
          </Button>
        </Link>
      </div>

      <form method="get" className="fyh-glass flex flex-wrap items-end gap-3 p-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fyh-text-muted" />
          <Input
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search name, SKU, brand, or category"
            className="pl-9"
          />
        </div>
        <div className="space-y-1">
          <label className="fyh-label">Status</label>
          <select name="status" defaultValue={status ?? 'active'} className={fieldClass}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {products.length === 0 ? (
        <div className="fyh-glass px-6 py-16 text-center">
          <p className="fyh-display text-xl font-semibold">No products yet</p>
          <p className="mt-2 text-sm text-fyh-text-muted">
            Add retail and consumable products for the salon.
          </p>
          <Link href="/products/new" className="mt-6 inline-block">
            <Button type="button">Add product</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 md:hidden">
            {products.map((p) => (
              <Link
                key={p.id}
                href={`/products/${p.id}`}
                className="fyh-glass block space-y-2 p-4 transition hover:bg-white/[0.03]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="mt-0.5 text-xs text-fyh-text-muted">
                      {[p.brand, p.category, p.sku].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <span className="tabular-nums text-fyh-accent">
                    {formatInrFromPaise(p.sellingPricePaise)}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          <div className="fyh-glass hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Stock</th>
                    <th>Price</th>
                    <th>Type</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--fyh-border)]">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <Link
                          href={`/products/${p.id}`}
                          className="font-medium hover:text-fyh-accent"
                        >
                          {p.name}
                        </Link>
                        {p.brand ? (
                          <p className="text-xs text-fyh-text-muted">{p.brand}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-fyh-text-muted">
                        {p.sku || '—'}
                      </td>
                      <td className="px-4 py-3 text-fyh-text-muted">{p.category || '—'}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {p.stockQty} {p.unit}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-fyh-accent">
                        {formatInrFromPaise(p.sellingPricePaise)}
                      </td>
                      <td className="px-4 py-3 text-xs text-fyh-text-muted">
                        {[p.isRetail ? 'Retail' : null, p.isConsumable ? 'Consumable' : null]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={p.isActive ? 'text-fyh-success' : 'text-fyh-text-muted'}>
                          {p.isActive ? 'Active' : 'Archived'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProductForm({
  mode,
  product,
}: {
  mode: 'create' | 'edit';
  product?: FyhProduct;
}) {
  const action = mode === 'create' ? createProductAction : updateProductAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveProductAction,
    initialState,
  );

  return (
    <div className="space-y-4">
      <form action={formAction} className="fyh-glass space-y-4 p-5">
        {mode === 'edit' && product ? <input type="hidden" name="id" value={product.id} /> : null}
        <input
          type="hidden"
          name="isActive"
          value={product?.isActive === false ? 'false' : 'true'}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <label className="fyh-label" htmlFor="name">
              Name *
            </label>
            <Input id="name" name="name" required defaultValue={product?.name ?? ''} />
          </div>
          <div className="space-y-2">
            <label className="fyh-label" htmlFor="sku">
              SKU
            </label>
            <Input id="sku" name="sku" defaultValue={product?.sku ?? ''} />
          </div>
          <div className="space-y-2">
            <label className="fyh-label" htmlFor="barcode">
              Barcode
            </label>
            <Input id="barcode" name="barcode" defaultValue={product?.barcode ?? ''} />
          </div>
          <div className="space-y-2">
            <label className="fyh-label" htmlFor="brand">
              Brand
            </label>
            <Input id="brand" name="brand" defaultValue={product?.brand ?? ''} />
          </div>
          <div className="space-y-2">
            <label className="fyh-label" htmlFor="category">
              Category
            </label>
            <Input
              id="category"
              name="category"
              placeholder="Colour · Care · Retail…"
              defaultValue={product?.category ?? ''}
            />
          </div>
          <div className="space-y-2">
            <label className="fyh-label" htmlFor="sellingPriceRupees">
              Selling price (₹) *
            </label>
            <Input
              id="sellingPriceRupees"
              name="sellingPriceRupees"
              type="number"
              min={0}
              required
              defaultValue={product ? Math.round(product.sellingPricePaise / 100) : 0}
            />
          </div>
          <div className="space-y-2">
            <label className="fyh-label" htmlFor="costPriceRupees">
              Cost price (₹)
            </label>
            <Input
              id="costPriceRupees"
              name="costPriceRupees"
              type="number"
              min={0}
              defaultValue={product ? Math.round(product.costPricePaise / 100) : 0}
            />
          </div>
          <div className="space-y-2">
            <label className="fyh-label" htmlFor="stockQty">
              Stock qty
            </label>
            <Input
              id="stockQty"
              name="stockQty"
              type="number"
              min={0}
              step="any"
              defaultValue={product?.stockQty ?? 0}
            />
          </div>
          <div className="space-y-2">
            <label className="fyh-label" htmlFor="reorderLevel">
              Reorder level
            </label>
            <Input
              id="reorderLevel"
              name="reorderLevel"
              type="number"
              min={0}
              step="any"
              defaultValue={product?.reorderLevel ?? 0}
            />
          </div>
          <div className="space-y-2">
            <label className="fyh-label" htmlFor="unit">
              Unit
            </label>
            <Input id="unit" name="unit" defaultValue={product?.unit ?? 'unit'} />
          </div>
          <div className="space-y-2">
            <label className="fyh-label" htmlFor="gstPercent">
              GST (%)
            </label>
            <Input
              id="gstPercent"
              name="gstPercent"
              type="number"
              min={0}
              step={0.1}
              defaultValue={product ? product.gstBps / 100 : 0}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <label className="fyh-label" htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={product?.description ?? ''}
              className={fieldClass}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isRetail"
              defaultChecked={product?.isRetail ?? true}
              className="accent-[var(--fyh-accent)]"
            />
            Retail product
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isConsumable"
              defaultChecked={product?.isConsumable ?? true}
              className="accent-[var(--fyh-accent)]"
            />
            Consumable (for services)
          </label>
        </div>

        {state.error ? <p className="text-sm text-fyh-danger">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-fyh-success">{state.success}</p> : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : mode === 'create' ? 'Create product' : 'Save changes'}
          </Button>
          <Link href="/products">
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </Link>
        </div>
      </form>

      {mode === 'edit' && product?.isActive ? (
        <form action={archiveAction} className="fyh-glass space-y-2 p-4">
          <input type="hidden" name="id" value={product.id} />
          <h3 className="font-medium">Archive product</h3>
          <p className="text-sm text-fyh-text-muted">
            Hides from active catalogs. Historical invoices keep their line items.
          </p>
          {archiveState.error ? (
            <p className="text-sm text-fyh-danger">{archiveState.error}</p>
          ) : null}
          <Button type="submit" variant="secondary" disabled={archivePending}>
            Archive
          </Button>
        </form>
      ) : null}
    </div>
  );
}
