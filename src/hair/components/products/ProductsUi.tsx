'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import {
  archiveProductAction,
  createProductAction,
  deleteProductAction,
  updateProductAction,
  type ProductActionState,
} from '@/src/hair/actions/products';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhBrand } from '@/src/hair/db/schema';
import type { ProductWithBrand } from '@/src/hair/services/products';
import {
  FYH_PRODUCT_TYPES,
  productMarginPercent,
  productProfitPaise,
  productTypeLabel,
  type FyhProductType,
} from '@/src/hair/lib/productTypes';
import { formatInrFromPaise } from '@/src/hair/lib/money';

const initialState: ProductActionState = {};

const fieldClass =
  'fyh-input w-full text-[0.8125rem] outline-none focus:border-fyh-accent/50';

export function ProductsList({
  products,
  q,
  status,
}: {
  products: ProductWithBrand[];
  q?: string;
  status?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="fyh-section-eyebrow">Inventory</p>
          <h1 className="fyh-display mt-1 font-semibold">Products</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Professional supplies for services · Retail items for billing
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
            placeholder="Search name or brand"
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
          <Link href="/products/new" className="mt-6 inline-block">
            <Button type="button">Add product</Button>
          </Link>
        </div>
      ) : (
        <div className="fyh-glass overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Product</th>
                <th>Type</th>
                <th>Stock</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--fyh-border)]">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <Link href={`/products/${p.id}`} className="font-medium hover:text-fyh-accent">
                      {p.name}
                    </Link>
                    {p.brandName ? (
                      <p className="text-xs text-fyh-text-muted">{p.brandName}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-fyh-text-muted">
                    {productTypeLabel(p.productType)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{p.stockQty}</td>
                  <td className="px-4 py-3 tabular-nums text-fyh-accent">
                    {p.productType === 'retail' ? formatInrFromPaise(p.sellingPricePaise) : '—'}
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
      )}
    </div>
  );
}

function ProductTypeRadios({
  defaultValue = 'retail',
  onChange,
}: {
  defaultValue?: FyhProductType;
  onChange?: (type: FyhProductType) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="fyh-label">Product type</legend>
      <div className="flex flex-wrap gap-4 text-sm">
        {FYH_PRODUCT_TYPES.map((t) => (
          <label key={t} className="flex items-center gap-2">
            <input
              type="radio"
              name="productType"
              value={t}
              defaultChecked={defaultValue === t}
              onChange={() => onChange?.(t)}
            />
            <span>{productTypeLabel(t)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ProductForm({
  mode,
  product,
  brands,
}: {
  mode: 'create' | 'edit';
  product?: ProductWithBrand;
  brands: FyhBrand[];
}) {
  const action = mode === 'create' ? createProductAction : updateProductAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [productType, setProductType] = useState<FyhProductType>(
    product?.productType ?? 'retail',
  );

  return (
    <form action={formAction} className="fyh-glass space-y-4 p-5">
      {mode === 'edit' && product ? <input type="hidden" name="id" value={product.id} /> : null}
      <input type="hidden" name="isActive" value={product?.isActive === false ? 'false' : 'true'} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <label className="fyh-label" htmlFor="name">
            Product name *
          </label>
          <Input id="name" name="name" required defaultValue={product?.name ?? ''} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label className="fyh-label" htmlFor="brandId">
            Brand *
          </label>
          <select
            id="brandId"
            name="brandId"
            required
            className={fieldClass}
            defaultValue={product?.brandId ?? ''}
          >
            <option value="" disabled>
              Select brand
            </option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {brands.length === 0 ? (
            <p className="text-xs text-fyh-text-muted">
              Add brands on a vendor first — Vendors in the sidebar.
            </p>
          ) : null}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <ProductTypeRadios
            defaultValue={product?.productType ?? 'retail'}
            onChange={setProductType}
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
        {productType === 'retail' ? (
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
        ) : (
          <input type="hidden" name="sellingPriceRupees" value="0" />
        )}
        <div className="space-y-2">
          <label className="fyh-label" htmlFor="stockQty">
            Current stock
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
  );
}

export function ProductDetailActions({ product }: { product: ProductWithBrand }) {
  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveProductAction,
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteProductAction,
    initialState,
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href="#edit">
        <Button type="button" variant="secondary" size="sm">
          Edit
        </Button>
      </a>
      {product.isActive ? (
        <form action={archiveAction}>
          <input type="hidden" name="id" value={product.id} />
          <Button type="submit" variant="secondary" size="sm" disabled={archivePending}>
            Archive
          </Button>
        </form>
      ) : null}
      <form
        action={deleteAction}
        onSubmit={(e) => {
          if (!confirm('Delete this product permanently?')) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={product.id} />
        <Button type="submit" variant="ghost" size="sm" disabled={deletePending}>
          Delete
        </Button>
      </form>
      {archiveState.error ? (
        <span className="text-xs text-fyh-danger">{archiveState.error}</span>
      ) : null}
      {deleteState.error ? (
        <span className="text-xs text-fyh-danger">{deleteState.error}</span>
      ) : null}
    </div>
  );
}

export function ProductProfitSummary({ product }: { product: ProductWithBrand }) {
  if (product.productType !== 'retail') return null;
  const profit = productProfitPaise(product);
  const margin = productMarginPercent(product);
  return (
    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div>
        <p className="text-fyh-text-muted">Cost</p>
        <p className="font-medium tabular-nums">{formatInrFromPaise(product.costPricePaise)}</p>
      </div>
      <div>
        <p className="text-fyh-text-muted">Selling</p>
        <p className="font-medium tabular-nums">{formatInrFromPaise(product.sellingPricePaise)}</p>
      </div>
      <div>
        <p className="text-fyh-text-muted">Profit</p>
        <p className="font-medium tabular-nums text-fyh-success">{formatInrFromPaise(profit)}</p>
      </div>
      <div>
        <p className="text-fyh-text-muted">Margin</p>
        <p className="font-medium tabular-nums">{margin}%</p>
      </div>
    </div>
  );
}
