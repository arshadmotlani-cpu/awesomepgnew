'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import {
  archiveServiceAction,
  createServiceAction,
  restoreServiceAction,
  updateServiceAction,
  type ServiceActionState,
} from '@/src/hair/actions/services';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import {
  FYH_COMMISSION_TYPES,
  type FyhProduct,
  type FyhService,
  type FyhServiceCategory,
  type FyhStaff,
} from '@/src/hair/db/schema';
import { formatInrFromPaise } from '@/src/hair/lib/money';

const initialState: ServiceActionState = {};

const fieldClass =
  'w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 py-2 text-sm text-fyh-text outline-none focus:border-fyh-accent/50';

type ConsumableRow = { key: string; productId: string; quantity: string };

export function ServicesList({
  services,
  categories,
  q,
  status,
  category,
}: {
  services: FyhService[];
  categories: FyhServiceCategory[];
  q?: string;
  status?: string;
  category?: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-fyh-accent">
            Menu
          </p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">Services</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Catalog for appointments, billing, commissions, and packages
          </p>
        </div>
        <Link href="/services/new">
          <Button type="button">
            <Plus className="mr-2 h-4 w-4" />
            Add service
          </Button>
        </Link>
      </div>

      <form method="get" className="fyh-glass flex flex-wrap items-end gap-3 p-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fyh-text-muted" />
          <Input
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search name, category, or code"
            className="pl-9"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wide text-fyh-text-muted">Status</label>
          <select name="status" defaultValue={status ?? 'active'} className={fieldClass}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wide text-fyh-text-muted">
            Category
          </label>
          <select name="category" defaultValue={category ?? ''} className={fieldClass}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {services.length === 0 ? (
        <div className="fyh-glass px-6 py-16 text-center">
          <p className="fyh-display text-xl font-semibold">No services match</p>
          <p className="mt-2 text-sm text-fyh-text-muted">
            Adjust filters or add a service to the menu.
          </p>
          <Link href="/services/new" className="mt-6 inline-block">
            <Button type="button">Add service</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {services.map((s) => (
              <Link
                key={s.id}
                href={`/services/${s.id}`}
                className="fyh-glass block space-y-2 p-4 transition hover:bg-white/[0.03]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="mt-0.5 text-xs text-fyh-text-muted">
                      {s.code || '—'} · {s.category || 'Uncategorised'}
                    </p>
                  </div>
                  <span className="tabular-nums text-fyh-accent">
                    {formatInrFromPaise(s.pricePaise)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] text-fyh-text-muted">
                  <span>{s.durationMinutes} min</span>
                  <span>·</span>
                  <span>{s.isActive ? 'Active' : 'Archived'}</span>
                  {s.featured ? <span className="text-fyh-accent">· Featured</span> : null}
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop table */}
          <div className="fyh-glass hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="border-b border-[color:var(--fyh-border)] bg-black/20 text-xs uppercase tracking-wide text-fyh-text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Service</th>
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Duration</th>
                    <th className="px-4 py-3 font-medium">Price</th>
                    <th className="px-4 py-3 font-medium">GST</th>
                    <th className="px-4 py-3 font-medium">Online</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--fyh-border)]">
                  {services.map((s) => (
                    <tr key={s.id} className="hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <Link
                          href={`/services/${s.id}`}
                          className="font-medium hover:text-fyh-accent"
                        >
                          {s.name}
                        </Link>
                        {s.featured ? (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-fyh-accent">
                            Featured
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-fyh-text-muted">
                        {s.code || '—'}
                      </td>
                      <td className="px-4 py-3 text-fyh-text-muted">{s.category || '—'}</td>
                      <td className="px-4 py-3 tabular-nums">{s.durationMinutes} min</td>
                      <td className="px-4 py-3 tabular-nums text-fyh-accent">
                        {formatInrFromPaise(s.pricePaise)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-fyh-text-muted">
                        {(s.gstBps / 100).toFixed(s.gstBps % 100 === 0 ? 0 : 1)}%
                      </td>
                      <td className="px-4 py-3 text-fyh-text-muted">
                        {s.availableOnline ? 'Yes' : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            s.isActive ? 'text-fyh-success' : 'text-fyh-text-muted'
                          }
                        >
                          {s.isActive ? 'Active' : 'Archived'}
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

export function ServiceForm({
  mode,
  service,
  categories,
  staff,
  products,
  selectedStaffIds = [],
  consumables = [],
}: {
  mode: 'create' | 'edit';
  service?: FyhService;
  categories: FyhServiceCategory[];
  staff: FyhStaff[];
  products: FyhProduct[];
  selectedStaffIds?: string[];
  consumables?: Array<{ productId: string; quantity: number }>;
}) {
  const action = mode === 'create' ? createServiceAction : updateServiceAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveServiceAction,
    initialState,
  );
  const [restoreState, restoreAction, restorePending] = useActionState(
    restoreServiceAction,
    initialState,
  );

  const initialCategory = service?.category ?? '';
  const categoryNames = useMemo(() => new Set(categories.map((c) => c.name)), [categories]);
  const isCustomInitial = Boolean(initialCategory && !categoryNames.has(initialCategory));

  const [categoryMode, setCategoryMode] = useState(
    isCustomInitial ? '__custom__' : initialCategory || '',
  );
  const [commissionType, setCommissionType] = useState(service?.commissionType ?? 'none');
  const [consumableRows, setConsumableRows] = useState<ConsumableRow[]>(() =>
    consumables.length
      ? consumables.map((c, i) => ({
          key: `c-${i}`,
          productId: c.productId,
          quantity: String(c.quantity),
        }))
      : [],
  );

  return (
    <div className="space-y-6">
      {mode === 'edit' && service ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="fyh-glass p-3">
            <p className="text-[11px] uppercase tracking-wide text-fyh-text-muted">Bookings</p>
            <p className="mt-1 text-lg tabular-nums">{service.totalBookings}</p>
          </div>
          <div className="fyh-glass p-3">
            <p className="text-[11px] uppercase tracking-wide text-fyh-text-muted">Revenue</p>
            <p className="mt-1 text-lg tabular-nums text-fyh-accent">
              {formatInrFromPaise(service.revenueGeneratedPaise)}
            </p>
          </div>
          <div className="fyh-glass p-3">
            <p className="text-[11px] uppercase tracking-wide text-fyh-text-muted">Last booked</p>
            <p className="mt-1 text-sm">
              {service.lastBookedAt
                ? new Date(service.lastBookedAt).toLocaleDateString('en-IN')
                : '—'}
            </p>
          </div>
          <div className="fyh-glass p-3">
            <p className="text-[11px] uppercase tracking-wide text-fyh-text-muted">Avg duration</p>
            <p className="mt-1 text-lg tabular-nums">{service.averageDurationMinutes} min</p>
          </div>
        </div>
      ) : null}

      <form action={formAction} className="space-y-4">
        {mode === 'edit' && service ? <input type="hidden" name="id" value={service.id} /> : null}
        <input type="hidden" name="isActive" value={service?.isActive === false ? 'false' : 'true'} />

        <section className="fyh-glass space-y-4 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-fyh-accent">
            Service details
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm text-fyh-text-secondary" htmlFor="name">
                Name *
              </label>
              <Input id="name" name="name" required defaultValue={service?.name ?? ''} />
            </div>

            {mode === 'edit' && service?.code ? (
              <div className="space-y-2">
                <label className="text-sm text-fyh-text-secondary">Service code</label>
                <Input value={service.code} readOnly className="font-mono opacity-80" />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm text-fyh-text-secondary">Service code</label>
                <p className="rounded-xl border border-[color:var(--fyh-border)] bg-black/10 px-3 py-2 text-sm text-fyh-text-muted">
                  Auto-generated on save (SVC-####)
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm text-fyh-text-secondary" htmlFor="category">
                Category
              </label>
              <select
                id="category"
                name="category"
                className={fieldClass}
                value={categoryMode}
                onChange={(e) => setCategoryMode(e.target.value)}
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
                <option value="__custom__">Custom category…</option>
              </select>
            </div>

            {categoryMode === '__custom__' ? (
              <div className="space-y-2">
                <label className="text-sm text-fyh-text-secondary" htmlFor="customCategory">
                  Custom category
                </label>
                <Input
                  id="customCategory"
                  name="customCategory"
                  defaultValue={isCustomInitial ? initialCategory : ''}
                  placeholder="e.g. Keratin"
                  required
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm text-fyh-text-secondary" htmlFor="durationMinutes">
                Duration (minutes) *
              </label>
              <Input
                id="durationMinutes"
                name="durationMinutes"
                type="number"
                min={5}
                step={5}
                required
                defaultValue={service?.durationMinutes ?? 30}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-fyh-text-secondary" htmlFor="displayOrder">
                Display order
              </label>
              <Input
                id="displayOrder"
                name="displayOrder"
                type="number"
                defaultValue={service?.displayOrder ?? 100}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-fyh-text-secondary" htmlFor="sellingPriceRupees">
                Selling price (₹) *
              </label>
              <Input
                id="sellingPriceRupees"
                name="sellingPriceRupees"
                type="number"
                min={0}
                step={1}
                required
                defaultValue={service ? Math.round(service.pricePaise / 100) : 0}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-fyh-text-secondary" htmlFor="costPriceRupees">
                Cost price (₹)
              </label>
              <Input
                id="costPriceRupees"
                name="costPriceRupees"
                type="number"
                min={0}
                step={1}
                defaultValue={service ? Math.round(service.costPricePaise / 100) : 0}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-fyh-text-secondary" htmlFor="gstPercent">
                GST (%)
              </label>
              <Input
                id="gstPercent"
                name="gstPercent"
                type="number"
                min={0}
                step={0.1}
                defaultValue={service ? service.gstBps / 100 : 0}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm text-fyh-text-secondary" htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={service?.description ?? ''}
                className={fieldClass}
              />
            </div>
          </div>
        </section>

        <section className="fyh-glass space-y-4 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-fyh-accent">
            Staff assignment
          </h2>
          {staff.length === 0 ? (
            <p className="text-sm text-fyh-text-muted">
              No staff yet.{' '}
              <Link href="/staff" className="text-fyh-accent hover:underline">
                Add staff
              </Link>{' '}
              to assign who can perform this service.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {staff.map((member) => (
                <label
                  key={member.id}
                  className="flex items-center gap-2 rounded-xl border border-[color:var(--fyh-border)] bg-black/10 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="staffIds"
                    value={member.id}
                    defaultChecked={selectedStaffIds.includes(member.id)}
                    className="accent-[var(--fyh-accent)]"
                  />
                  <span>
                    {member.fullName}
                    {member.role ? (
                      <span className="text-fyh-text-muted"> · {member.role}</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>

        <section className="fyh-glass space-y-4 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-fyh-accent">
            Commission
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm text-fyh-text-secondary" htmlFor="commissionType">
                Type
              </label>
              <select
                id="commissionType"
                name="commissionType"
                className={fieldClass}
                value={commissionType}
                onChange={(e) => setCommissionType(e.target.value as typeof commissionType)}
              >
                {FYH_COMMISSION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === 'none' ? 'None' : t === 'fixed' ? 'Fixed' : 'Percentage'}
                  </option>
                ))}
              </select>
            </div>
            {commissionType === 'fixed' ? (
              <div className="space-y-2">
                <label className="text-sm text-fyh-text-secondary" htmlFor="commissionFixedRupees">
                  Fixed commission (₹)
                </label>
                <Input
                  id="commissionFixedRupees"
                  name="commissionFixedRupees"
                  type="number"
                  min={0}
                  defaultValue={
                    service ? Math.round(service.commissionFixedPaise / 100) : 0
                  }
                />
              </div>
            ) : null}
            {commissionType === 'percentage' ? (
              <div className="space-y-2">
                <label className="text-sm text-fyh-text-secondary" htmlFor="commissionPercent">
                  Commission (%)
                </label>
                <Input
                  id="commissionPercent"
                  name="commissionPercent"
                  type="number"
                  min={0}
                  step={0.1}
                  defaultValue={service ? service.commissionPercentBps / 100 : 0}
                />
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                name="overrideStaffCommission"
                defaultChecked={service?.overrideStaffCommission ?? false}
                className="accent-[var(--fyh-accent)]"
              />
              Override staff default commission
            </label>
          </div>
        </section>

        <section className="fyh-glass space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium uppercase tracking-wide text-fyh-accent">
                Consumables
              </h2>
              <p className="mt-1 text-xs text-fyh-text-muted">
                Attach products & quantities. Inventory deduction stays off until Inventory is live.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setConsumableRows((rows) => [
                  ...rows,
                  { key: `n-${Date.now()}`, productId: '', quantity: '1' },
                ])
              }
            >
              Add product
            </Button>
          </div>
          {consumableRows.length === 0 ? (
            <p className="text-sm text-fyh-text-muted">No consumables attached.</p>
          ) : (
            <div className="space-y-2">
              {consumableRows.map((row, index) => (
                <div key={row.key} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[12rem] flex-1 space-y-1">
                    <label className="text-[11px] text-fyh-text-muted">Product</label>
                    <select
                      name="consumableProductId"
                      className={fieldClass}
                      value={row.productId}
                      onChange={(e) => {
                        const value = e.target.value;
                        setConsumableRows((rows) =>
                          rows.map((r, i) => (i === index ? { ...r, productId: value } : r)),
                        );
                      }}
                    >
                      <option value="">Select product</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-28 space-y-1">
                    <label className="text-[11px] text-fyh-text-muted">Qty</label>
                    <Input
                      name="consumableQty"
                      type="number"
                      min={0.001}
                      step="any"
                      value={row.quantity}
                      onChange={(e) => {
                        const value = e.target.value;
                        setConsumableRows((rows) =>
                          rows.map((r, i) => (i === index ? { ...r, quantity: value } : r)),
                        );
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setConsumableRows((rows) => rows.filter((_, i) => i !== index))
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
          {products.length === 0 ? (
            <p className="text-xs text-fyh-text-muted">
              <Link href="/products/new" className="text-fyh-accent hover:underline">
                Create products
              </Link>{' '}
              first to attach consumables.
            </p>
          ) : null}
        </section>

        <section className="fyh-glass space-y-4 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-fyh-accent">
            Online booking
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="availableOnline"
                defaultChecked={service?.availableOnline ?? false}
                className="accent-[var(--fyh-accent)]"
              />
              Available for online booking
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="featured"
                defaultChecked={service?.featured ?? false}
                className="accent-[var(--fyh-accent)]"
              />
              Featured service
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="showOnWebsite"
                defaultChecked={service?.showOnWebsite ?? false}
                className="accent-[var(--fyh-accent)]"
              />
              Show on website
            </label>
          </div>
        </section>

        {state.error ? <p className="text-sm text-fyh-danger">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-fyh-success">{state.success}</p> : null}
        {restoreState.success ? (
          <p className="text-sm text-fyh-success">{restoreState.success}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : mode === 'create' ? 'Create service' : 'Save changes'}
          </Button>
          <Link href="/services">
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </Link>
        </div>
      </form>

      {mode === 'edit' && service?.isActive ? (
        <form action={archiveAction} className="fyh-glass space-y-2 p-4">
          <input type="hidden" name="id" value={service.id} />
          <h3 className="font-medium">Archive service</h3>
          <p className="text-sm text-fyh-text-muted">
            Keeps the service on historical invoices. Blocks new appointments from using it.
          </p>
          {archiveState.error ? (
            <p className="text-sm text-fyh-danger">{archiveState.error}</p>
          ) : null}
          <Button type="submit" variant="secondary" disabled={archivePending}>
            Archive
          </Button>
        </form>
      ) : null}

      {mode === 'edit' && service && !service.isActive ? (
        <form action={restoreAction} className="fyh-glass space-y-2 p-4">
          <input type="hidden" name="id" value={service.id} />
          <h3 className="font-medium">Restore service</h3>
          <p className="text-sm text-fyh-text-muted">
            Return to the active menu so it can be booked again.
          </p>
          {restoreState.error ? (
            <p className="text-sm text-fyh-danger">{restoreState.error}</p>
          ) : null}
          <Button type="submit" disabled={restorePending}>
            Restore
          </Button>
        </form>
      ) : null}
    </div>
  );
}
