'use client';

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, X } from 'lucide-react';
import {
  adjustProductStockAction,
  archiveProductAction,
  createProductAction,
  quickCreateVendorForProductAction,
  restoreProductAction,
  updateProductAction,
  type ProductActionState,
  type StockAdjustFormValues,
} from '@/src/hair/actions/products';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhBrand, FyhVendor } from '@/src/hair/db/schema';
import type { ProductFormFieldKey, ProductFormValues } from '@/src/hair/lib/productConfigurationForm';
import type { ProductWithBrand } from '@/src/hair/services/products';
import { FYH_PRODUCT_TYPES, productTypeLabel } from '@/src/hair/lib/productTypes';
import { formatInrFromPaise } from '@/src/hair/lib/money';

const initialState: ProductActionState = {};

const fieldClass =
  'fyh-input w-full text-[0.8125rem] outline-none focus:border-fyh-accent/50';

function emptyProductFormValues(): ProductFormValues {
  return {
    name: '',
    brandId: '',
    newBrandName: '',
    vendorId: '',
    category: '',
    description: '',
    productType: 'retail',
    costPriceRupees: '0',
    sellingPriceRupees: '0',
    openingStockQty: '0',
    isActive: true,
  };
}

function productToFormValues(product: ProductWithBrand): ProductFormValues {
  return {
    name: product.name,
    brandId: product.brandId,
    newBrandName: '',
    vendorId: product.vendorId ?? '',
    category: product.category ?? '',
    description: product.description ?? '',
    productType: product.productType,
    costPriceRupees: String(Math.round(product.costPricePaise / 100)),
    sellingPriceRupees: String(Math.round(product.sellingPricePaise / 100)),
    openingStockQty: '0',
    isActive: product.isActive !== false,
  };
}

function clientValidateProductForm(
  values: ProductFormValues,
  canManageInventory: boolean,
): Partial<Record<ProductFormFieldKey, string>> {
  const fieldErrors: Partial<Record<ProductFormFieldKey, string>> = {};
  if (!values.name.trim()) fieldErrors.name = 'Product name is required';
  if (!values.brandId && !values.newBrandName.trim()) {
    fieldErrors.brandId = 'Select a brand or enter a new brand name';
    fieldErrors.newBrandName = 'Select a brand or enter a new brand name';
  }
  if (values.productType === 'retail' && Number(values.sellingPriceRupees) <= 0) {
    fieldErrors.sellingPriceRupees = 'Retail products require a selling price';
  }
  if (!canManageInventory) {
    if (Number(values.costPriceRupees) !== 0) {
      fieldErrors.costPriceRupees = 'Cost price requires inventory permission';
    }
    if (Number(values.openingStockQty) !== 0) {
      fieldErrors.openingStockQty = 'Opening stock requires inventory permission';
    }
  }
  return fieldErrors;
}

const FIELD_ORDER: ProductFormFieldKey[] = [
  'name',
  'brandId',
  'newBrandName',
  'sellingPriceRupees',
  'costPriceRupees',
  'openingStockQty',
];

function focusFirstField(fieldErrors: Partial<Record<ProductFormFieldKey, string>>) {
  const key = FIELD_ORDER.find((k) => fieldErrors[k]);
  if (!key) return;
  const el = document.querySelector<HTMLElement>(`[data-product-field="${key}"]`);
  el?.focus();
}

export type ProductsMasterProps = {
  products: ProductWithBrand[];
  brands: FyhBrand[];
  vendors: FyhVendor[];
  q?: string;
  status?: string;
  canManageInventory: boolean;
};

function DrawerShell({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[min(92vh,800px)] w-full max-w-3xl flex-col overflow-hidden border border-[color:var(--fyh-border)] bg-fyh-elevated shadow-2xl sm:max-w-2xl sm:rounded-2xl lg:max-w-3xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--fyh-border)] px-4 py-3">
          <h2 className="fyh-display text-lg font-semibold">{title}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        <div className="shrink-0 border-t border-[color:var(--fyh-border)] bg-fyh-elevated px-4 py-3">
          {footer}
        </div>
      </div>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[0.7rem] text-fyh-danger" role="alert">{message}</p>;
}

function ProductFormFields({
  mode,
  values,
  setValues,
  fieldErrors,
  brands,
  vendors,
  canManageInventory,
  onVendorCreated,
}: {
  mode: 'create' | 'edit';
  values: ProductFormValues;
  setValues: React.Dispatch<React.SetStateAction<ProductFormValues>>;
  fieldErrors: Partial<Record<ProductFormFieldKey, string>>;
  brands: FyhBrand[];
  vendors: FyhVendor[];
  canManageInventory: boolean;
  onVendorCreated?: (vendor: { id: string; name: string }) => void;
}) {
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [vendorBusy, setVendorBusy] = useState(false);
  const [vendorError, setVendorError] = useState<string | null>(null);

  const filteredBrands = useMemo(() => {
    if (!values.vendorId) return brands;
    return brands.filter((b) => b.vendorId === values.vendorId || !b.vendorId);
  }, [brands, values.vendorId]);

  async function submitNewVendor() {
    setVendorBusy(true);
    setVendorError(null);
    const res = await quickCreateVendorForProductAction(newVendorName);
    setVendorBusy(false);
    if (res.error) {
      setVendorError(res.error);
      return;
    }
    if (res.vendor) {
      onVendorCreated?.(res.vendor);
      setValues((v) => ({ ...v, vendorId: res.vendor!.id }));
      setShowNewVendor(false);
      setNewVendorName('');
    }
  }

  const patch = (partial: Partial<ProductFormValues>) => {
    setValues((v) => ({ ...v, ...partial }));
  };

  return (
    <>
      <input type="hidden" name="returnToList" value="1" />
      <input type="hidden" name="isActive" value={values.isActive ? 'true' : 'false'} />
      <input type="hidden" name="productType" value={values.productType} />

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1 md:col-span-2 lg:col-span-3">
          <label className="fyh-label text-xs" htmlFor="name">Product name *</label>
          <Input
            id="name"
            name="name"
            required
            data-product-field="name"
            value={values.name}
            onChange={(e) => patch({ name: e.target.value })}
            aria-invalid={Boolean(fieldErrors.name)}
          />
          <FieldError message={fieldErrors.name} />
        </div>

        <div className="space-y-1">
          <label className="fyh-label text-xs" htmlFor="category">Category</label>
          <Input
            id="category"
            name="category"
            value={values.category}
            onChange={(e) => patch({ category: e.target.value })}
          />
        </div>

        <div className="space-y-1 md:col-span-2 lg:col-span-1">
          <label className="fyh-label text-xs" htmlFor="vendorId">Preferred vendor</label>
          <select
            id="vendorId"
            name="vendorId"
            className={fieldClass}
            data-product-field="vendorId"
            value={values.vendorId}
            onChange={(e) => patch({ vendorId: e.target.value })}
          >
            <option value="">Any vendor</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center md:col-span-2 lg:col-span-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setShowNewVendor((s) => !s)}
          >
            {showNewVendor ? 'Cancel new vendor' : '+ Add vendor'}
          </Button>
        </div>

        {showNewVendor ? (
          <div className="flex flex-wrap gap-2 md:col-span-2 lg:col-span-3">
            <Input
              placeholder="Vendor name"
              value={newVendorName}
              onChange={(e) => setNewVendorName(e.target.value)}
              className="min-w-0 flex-1"
            />
            <Button type="button" size="sm" disabled={vendorBusy} onClick={() => void submitNewVendor()}>
              Save vendor
            </Button>
            {vendorError ? <p className="w-full text-xs text-fyh-danger">{vendorError}</p> : null}
          </div>
        ) : null}

        <div className="space-y-1">
          <label className="fyh-label text-xs" htmlFor="brandId">Brand *</label>
          <select
            id="brandId"
            name="brandId"
            className={fieldClass}
            data-product-field="brandId"
            value={values.brandId}
            onChange={(e) => patch({ brandId: e.target.value })}
            aria-invalid={Boolean(fieldErrors.brandId)}
          >
            <option value="">Select existing brand</option>
            {filteredBrands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <FieldError message={fieldErrors.brandId} />
        </div>

        <div className="space-y-1 md:col-span-1 lg:col-span-2">
          <label className="fyh-label text-xs" htmlFor="newBrandName">New brand name</label>
          <Input
            id="newBrandName"
            name="newBrandName"
            data-product-field="newBrandName"
            placeholder="Or type a new brand (links to vendor when selected)"
            value={values.newBrandName}
            onChange={(e) => patch({ newBrandName: e.target.value })}
            aria-invalid={Boolean(fieldErrors.newBrandName)}
          />
          <FieldError message={fieldErrors.newBrandName} />
        </div>

        <div className="md:col-span-2 lg:col-span-3">
          <fieldset className="space-y-1">
            <legend className="fyh-label text-xs">Product type</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {FYH_PRODUCT_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="productTypeDisplay"
                    checked={values.productType === t}
                    onChange={() => patch({ productType: t })}
                  />
                  <span>{productTypeLabel(t)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {canManageInventory ? (
          <div className="space-y-1">
            <label className="fyh-label text-xs" htmlFor="costPriceRupees">Cost price (₹)</label>
            <Input
              id="costPriceRupees"
              name="costPriceRupees"
              type="number"
              min={0}
              data-product-field="costPriceRupees"
              value={values.costPriceRupees}
              onChange={(e) => patch({ costPriceRupees: e.target.value })}
              aria-invalid={Boolean(fieldErrors.costPriceRupees)}
            />
            <FieldError message={fieldErrors.costPriceRupees} />
          </div>
        ) : (
          <input type="hidden" name="costPriceRupees" value="0" />
        )}

        {values.productType === 'retail' ? (
          <div className="space-y-1">
            <label className="fyh-label text-xs" htmlFor="sellingPriceRupees">Selling price (₹) *</label>
            <Input
              id="sellingPriceRupees"
              name="sellingPriceRupees"
              type="number"
              min={0}
              required
              data-product-field="sellingPriceRupees"
              value={values.sellingPriceRupees}
              onChange={(e) => patch({ sellingPriceRupees: e.target.value })}
              aria-invalid={Boolean(fieldErrors.sellingPriceRupees)}
            />
            <FieldError message={fieldErrors.sellingPriceRupees} />
          </div>
        ) : (
          <input type="hidden" name="sellingPriceRupees" value="0" />
        )}

        {mode === 'create' && canManageInventory ? (
          <div className="space-y-1 md:col-span-2 lg:col-span-1">
            <label className="fyh-label text-xs" htmlFor="openingStockQty">Opening stock</label>
            <Input
              id="openingStockQty"
              name="openingStockQty"
              type="number"
              min={0}
              step="any"
              data-product-field="openingStockQty"
              value={values.openingStockQty}
              onChange={(e) => patch({ openingStockQty: e.target.value })}
              aria-invalid={Boolean(fieldErrors.openingStockQty)}
            />
            <p className="text-[0.7rem] text-fyh-text-muted">
              Recorded as an auditable opening-stock movement.
            </p>
            <FieldError message={fieldErrors.openingStockQty} />
          </div>
        ) : mode === 'create' ? (
          <input type="hidden" name="openingStockQty" value="0" />
        ) : null}

        <div className="space-y-1 md:col-span-2 lg:col-span-3">
          <label className="fyh-label text-xs" htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            rows={2}
            value={values.description}
            onChange={(e) => patch({ description: e.target.value })}
            className={fieldClass}
          />
        </div>

        {!canManageInventory ? (
          <p className="text-[0.7rem] text-fyh-text-muted md:col-span-2 lg:col-span-3">
            Cost and opening stock can be set by users with inventory access. You can still set name, brand, and selling price.
          </p>
        ) : null}
      </div>
    </>
  );
}

function ProductFormDrawer({
  mode,
  product,
  brands,
  vendors,
  open,
  onClose,
  onSuccess,
  canManageInventory,
}: {
  mode: 'create' | 'edit';
  product?: ProductWithBrand;
  brands: FyhBrand[];
  vendors: FyhVendor[];
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  canManageInventory: boolean;
}) {
  const action = mode === 'create' ? createProductAction : updateProductAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [vendorList, setVendorList] = useState(vendors);
  const [values, setValues] = useState<ProductFormValues>(emptyProductFormValues());
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProductFormFieldKey, string>>>({});
  const wasOpenRef = useRef(false);

  useEffect(() => {
    setVendorList(vendors);
  }, [vendors]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setFieldErrors({});
      if (mode === 'edit' && product) {
        setValues(productToFormValues(product));
      } else {
        setValues(emptyProductFormValues());
      }
    }
    wasOpenRef.current = open;
  }, [open, mode, product]);

  useEffect(() => {
    if (state.values && !state.success) {
      setValues(state.values);
    }
    if (state.fieldErrors) {
      setFieldErrors(state.fieldErrors);
      focusFirstField(state.fieldErrors);
    } else if (state.error && !state.success) {
      setFieldErrors({});
    }
  }, [state.values, state.fieldErrors, state.error, state.success]);

  useEffect(() => {
    if (state.success) {
      onSuccess();
      onClose();
      setValues(emptyProductFormValues());
      setFieldErrors({});
    }
  }, [state.success, onClose, onSuccess]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    const clientErrors = clientValidateProductForm(values, canManageInventory);
    if (Object.keys(clientErrors).length > 0) {
      e.preventDefault();
      setFieldErrors(clientErrors);
      focusFirstField(clientErrors);
      return;
    }
    setFieldErrors({});
  };

  if (!open) return null;

  return (
    <DrawerShell
      title={mode === 'create' ? 'Add product' : 'Edit product'}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {state.error && !state.success ? (
            <p className="text-sm text-fyh-danger sm:order-first sm:flex-1">{state.error}</p>
          ) : (
            <span className="hidden sm:block sm:flex-1" />
          )}
          <div className="flex gap-2 sm:justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" form="product-form-drawer" disabled={pending}>
              {pending ? 'Saving…' : mode === 'create' ? 'Create product' : 'Save changes'}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="product-form-drawer"
        action={formAction}
        onSubmit={handleSubmit}
        className="space-y-3"
      >
        {mode === 'edit' && product ? <input type="hidden" name="id" value={product.id} /> : null}
        <ProductFormFields
          mode={mode}
          values={values}
          setValues={setValues}
          fieldErrors={fieldErrors}
          brands={brands}
          vendors={vendorList}
          canManageInventory={canManageInventory}
          onVendorCreated={(v) =>
            setVendorList((prev) => {
              if (prev.some((x) => x.id === v.id)) return prev;
              return [
                ...prev,
                {
                  id: v.id,
                  name: v.name,
                  organizationId: '',
                  locationId: null,
                  companyName: null,
                  contactName: null,
                  phone: null,
                  email: null,
                  gstin: null,
                  address: null,
                  bankDetails: null,
                  upiId: null,
                  qrCodeUrl: null,
                  notes: null,
                  isActive: true,
                  createdAt: new Date(),
                },
              ];
            })
          }
        />
      </form>
    </DrawerShell>
  );
}

function StockAdjustDrawer({
  product,
  open,
  onClose,
  onSuccess,
}: {
  product: ProductWithBrand | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [state, formAction, pending] = useActionState(adjustProductStockAction, initialState);
  const [stockValues, setStockValues] = useState<StockAdjustFormValues>({
    quantityDelta: '',
    reason: '',
  });
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setStockValues({ quantityDelta: '', reason: '' });
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (state.stockValues && !state.success) {
      setStockValues(state.stockValues);
    }
  }, [state.stockValues, state.success]);

  useEffect(() => {
    if (state.success) {
      onSuccess();
      onClose();
      setStockValues({ quantityDelta: '', reason: '' });
    }
  }, [state.success, onClose, onSuccess]);

  if (!open || !product) return null;

  return (
    <DrawerShell
      title="Adjust stock"
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {state.error && !state.success ? (
            <p className="text-sm text-fyh-danger sm:mr-auto">{state.error}</p>
          ) : null}
          <Button type="submit" form="stock-adjust-form" disabled={pending}>
            {pending ? 'Saving…' : 'Apply adjustment'}
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-fyh-text-secondary">
        <span className="font-medium text-fyh-text">{product.name}</span>
        <span className="text-fyh-text-muted"> · Current </span>
        <span className="tabular-nums font-medium">{product.stockQty}</span>
      </p>
      <form id="stock-adjust-form" action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={product.id} />
        <div className="space-y-1">
          <label className="fyh-label text-xs" htmlFor="quantityDelta">Quantity change</label>
          <Input
            id="quantityDelta"
            name="quantityDelta"
            type="number"
            step="any"
            required
            value={stockValues.quantityDelta}
            onChange={(e) => setStockValues((s) => ({ ...s, quantityDelta: e.target.value }))}
            placeholder="e.g. 5 or -2"
          />
          <p className="text-[0.7rem] text-fyh-text-muted">Use + to add, − to remove.</p>
        </div>
        <div className="space-y-1">
          <label className="fyh-label text-xs" htmlFor="reason">Reason *</label>
          <Input
            id="reason"
            name="reason"
            required
            value={stockValues.reason}
            onChange={(e) => setStockValues((s) => ({ ...s, reason: e.target.value }))}
            placeholder="e.g. Opening stock correction"
          />
        </div>
      </form>
    </DrawerShell>
  );
}

function ProductRowActions({
  product,
  onEdit,
  onAdjustStock,
}: {
  product: ProductWithBrand;
  onEdit: () => void;
  onAdjustStock: () => void;
}) {
  const [archiveState, archiveAction, archivePending] = useActionState(archiveProductAction, initialState);
  const [restoreState, restoreAction, restorePending] = useActionState(restoreProductAction, initialState);

  return (
    <div className="flex flex-wrap gap-1">
      <Button type="button" variant="secondary" size="sm" onClick={onEdit}>Edit</Button>
      <Button type="button" variant="secondary" size="sm" onClick={onAdjustStock}>Stock</Button>
      {product.isActive ? (
        <form action={archiveAction}>
          <input type="hidden" name="id" value={product.id} />
          <Button type="submit" variant="ghost" size="sm" disabled={archivePending}>Deactivate</Button>
        </form>
      ) : (
        <form action={restoreAction}>
          <input type="hidden" name="id" value={product.id} />
          <Button type="submit" variant="ghost" size="sm" disabled={restorePending}>Activate</Button>
        </form>
      )}
      {archiveState.error ? <span className="text-xs text-fyh-danger">{archiveState.error}</span> : null}
      {restoreState.error ? <span className="text-xs text-fyh-danger">{restoreState.error}</span> : null}
    </div>
  );
}

export function ProductsMaster({
  products,
  brands,
  vendors,
  q,
  status,
  canManageInventory,
}: ProductsMasterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductWithBrand | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<ProductWithBrand | null>(null);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useEffect(() => {
    if (searchParams.get('add') === '1') setAddOpen(true);
    const editId = searchParams.get('edit');
    if (editId) {
      const p = products.find((x) => x.id === editId);
      if (p) setEditProduct(p);
    }
  }, [searchParams, products]);

  const closeAdd = () => {
    setAddOpen(false);
    if (searchParams.get('add')) router.replace('/products');
  };

  const closeEdit = () => {
    setEditProduct(null);
    if (searchParams.get('edit')) router.replace('/products');
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="fyh-section-eyebrow">Configuration</p>
          <h1 className="fyh-display mt-0.5 text-xl font-semibold sm:text-2xl">Products</h1>
        </div>
        <Button type="button" onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add product
        </Button>
      </div>

      <form method="get" className="fyh-glass flex flex-wrap items-end gap-2 p-3">
        <div className="relative min-w-0 flex-1 basis-[12rem]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fyh-text-muted" />
          <Input name="q" defaultValue={q ?? ''} placeholder="Search product or brand" className="pl-9" />
        </div>
        <div className="space-y-0.5">
          <label className="fyh-label text-xs">Status</label>
          <select name="status" defaultValue={status ?? 'active'} className={fieldClass}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>
        <Button type="submit" variant="secondary" size="sm">Filter</Button>
      </form>

      {products.length === 0 ? (
        <div className="fyh-glass px-4 py-8 text-center sm:py-10">
          <p className="font-medium">No products yet</p>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Add your first product to start selling and tracking stock.
          </p>
          <Button type="button" className="mt-4" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add product
          </Button>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto fyh-glass md:block">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead>
                <tr className="text-fyh-text-muted">
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Brand</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Cost</th>
                  <th className="px-3 py-2 font-medium">Sell</th>
                  <th className="px-3 py-2 font-medium">Stock</th>
                  <th className="px-3 py-2 font-medium">Vendor</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--fyh-border)]">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2 text-fyh-text-muted">{p.brandName}</td>
                    <td className="px-3 py-2 text-fyh-text-muted">{p.category ?? '—'}</td>
                    <td className="px-3 py-2">{productTypeLabel(p.productType)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatInrFromPaise(p.costPricePaise)}</td>
                    <td className="px-3 py-2 tabular-nums text-fyh-accent">
                      {p.productType === 'retail' ? formatInrFromPaise(p.sellingPricePaise) : '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{p.stockQty}</td>
                    <td className="px-3 py-2 text-fyh-text-muted">{p.vendorName ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className={p.isActive ? 'text-fyh-success' : 'text-fyh-text-muted'}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <ProductRowActions
                        product={p}
                        onEdit={() => setEditProduct(p)}
                        onAdjustStock={() => setAdjustProduct(p)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 md:hidden">
            {products.map((p) => (
              <div key={p.id} className="fyh-glass space-y-2 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-fyh-text-muted">{p.brandName} · {productTypeLabel(p.productType)}</p>
                  </div>
                  <span className={p.isActive ? 'text-xs text-fyh-success' : 'text-xs text-fyh-text-muted'}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <span className="text-fyh-text-muted">Stock</span>
                  <span className="tabular-nums">{p.stockQty}</span>
                  <span className="text-fyh-text-muted">Sell</span>
                  <span className="tabular-nums">
                    {p.productType === 'retail' ? formatInrFromPaise(p.sellingPricePaise) : '—'}
                  </span>
                  <span className="text-fyh-text-muted">Vendor</span>
                  <span>{p.vendorName ?? '—'}</span>
                </div>
                <ProductRowActions
                  product={p}
                  onEdit={() => setEditProduct(p)}
                  onAdjustStock={() => setAdjustProduct(p)}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <ProductFormDrawer
        mode="create"
        brands={brands}
        vendors={vendors}
        open={addOpen}
        onClose={closeAdd}
        onSuccess={refresh}
        canManageInventory={canManageInventory}
      />
      <ProductFormDrawer
        mode="edit"
        product={editProduct ?? undefined}
        brands={brands}
        vendors={vendors}
        open={editProduct !== null}
        onClose={closeEdit}
        onSuccess={refresh}
        canManageInventory={canManageInventory}
      />
      <StockAdjustDrawer
        product={adjustProduct}
        open={adjustProduct !== null}
        onClose={() => setAdjustProduct(null)}
        onSuccess={refresh}
      />
    </div>
  );
}

/** @deprecated Use ProductsMaster on /products */
export function ProductsList(props: ProductsMasterProps) {
  return <ProductsMaster {...props} />;
}

export function ProductForm() {
  return null;
}

export function ProductDetailActions() {
  return null;
}

export function ProductProfitSummary() {
  return null;
}
