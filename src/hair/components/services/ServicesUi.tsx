'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import {
  createServiceAction,
  updateServiceAction,
  type ServiceActionState,
} from '@/src/hair/actions/services';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhService, FyhServiceCategory } from '@/src/hair/db/schema';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { cn } from '@/src/hair/lib/utils';

const initialState: ServiceActionState = {};

const fieldClass =
  'fyh-input w-full text-[0.8125rem] outline-none focus:border-fyh-accent/50';

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-fyh-accent">
            Menu
          </p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">Services</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            What you sell — priced for appointments, billing, and packages
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
            placeholder="Search name, category, or price"
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
                      {s.category || 'Uncategorised'} · {formatInrFromPaise(s.pricePaise)}
                    </p>
                  </div>
                  <span className="tabular-nums text-fyh-accent">
                    {formatInrFromPaise(s.pricePaise)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] text-fyh-text-muted">
                  <span>{s.durationMinutes} min</span>
                  <span>·</span>
                  <span>{s.isActive ? 'Active' : 'Inactive'}</span>
                </div>
              </Link>
            ))}
          </div>

          <div className="fyh-glass hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-[color:var(--fyh-border)] bg-black/20 text-xs uppercase tracking-wide text-fyh-text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Service</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Duration</th>
                    <th className="px-4 py-3 font-medium">Price</th>
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
                      </td>
                      <td className="px-4 py-3 text-fyh-text-muted">{s.category || '—'}</td>
                      <td className="px-4 py-3 tabular-nums">{s.durationMinutes} min</td>
                      <td className="px-4 py-3 tabular-nums text-fyh-accent">
                        {formatInrFromPaise(s.pricePaise)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            s.isActive ? 'text-fyh-success' : 'text-fyh-text-muted'
                          }
                        >
                          {s.isActive ? 'Active' : 'Inactive'}
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
}: {
  mode: 'create' | 'edit';
  service?: FyhService;
  categories: FyhServiceCategory[];
}) {
  const action = mode === 'create' ? createServiceAction : updateServiceAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [formKey, setFormKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const initialCategory = service?.category ?? '';
  const statusDefault = service?.isActive === false ? 'inactive' : 'active';
  const nameDuplicate = Boolean(state.duplicateServiceId);

  useEffect(() => {
    if (!state.success) return;
    setToast(state.success);
    const hide = window.setTimeout(() => setToast(null), 2800);
    if (mode === 'create' && state.created) {
      setFormKey((k) => k + 1);
      window.setTimeout(() => nameInputRef.current?.focus(), 0);
    }
    return () => window.clearTimeout(hide);
  }, [state.success, state.created, mode]);

  useEffect(() => {
    if (nameDuplicate) {
      nameInputRef.current?.focus();
    }
  }, [nameDuplicate, state.error]);

  return (
    <div className="relative space-y-4">
      {toast ? (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-[600] rounded-lg border border-fyh-success/40 bg-fyh-success/15 px-4 py-2.5 text-sm font-medium text-fyh-success shadow-lg"
        >
          ✓ {toast}
        </div>
      ) : null}

      <form key={mode === 'create' ? formKey : undefined} action={formAction} className="space-y-4">
        {mode === 'edit' && service ? <input type="hidden" name="id" value={service.id} /> : null}

        <section className="fyh-glass space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm text-fyh-text-secondary" htmlFor="name">
                Service name *
              </label>
              <Input
                ref={nameInputRef}
                id="name"
                name="name"
                required
                defaultValue={mode === 'edit' ? (service?.name ?? '') : ''}
                aria-invalid={nameDuplicate}
                className={cn(nameDuplicate && 'border-fyh-danger ring-1 ring-fyh-danger/50')}
              />
              {nameDuplicate ? (
                <div className="space-y-1">
                  <p className="text-sm text-fyh-danger">This service already exists.</p>
                  {state.duplicateServiceId ? (
                    <Link
                      href={`/services/${state.duplicateServiceId}`}
                      className="text-sm font-medium text-fyh-accent hover:underline"
                    >
                      Open existing service
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>

          <div className="space-y-1.5">
            <label className="text-sm text-fyh-text-secondary" htmlFor="category">
              Category *
            </label>
            <select
              id="category"
              name="category"
              className={fieldClass}
              defaultValue={mode === 'edit' ? initialCategory : ''}
              required
            >
              <option value="" disabled>
                Select category
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-fyh-text-muted">
              Hair, Skin, Makeup, Nails, Academy, or Digital Production.
            </p>
          </div>

          <div className="space-y-1.5">
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
              defaultValue={mode === 'edit' ? (service?.durationMinutes ?? 30) : 30}
            />
          </div>

          <div className="space-y-1.5">
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
              defaultValue={
                mode === 'edit' && service
                  ? Math.round(service.pricePaise / 100)
                  : ''
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-fyh-text-secondary" htmlFor="costPriceRupees">
              Cost price (₹) *
            </label>
            <Input
              id="costPriceRupees"
              name="costPriceRupees"
              type="number"
              min={0}
              step={1}
              required
              defaultValue={
                mode === 'edit' && service !== undefined
                  ? Math.round(service.costPricePaise / 100)
                  : ''
              }
            />
            <p className="text-[11px] text-fyh-text-muted">
              Internal only — margin and BI; never on invoices or POS.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-fyh-text-secondary" htmlFor="status">
              Status *
            </label>
            <select
              id="status"
              name="status"
              className={fieldClass}
              defaultValue={mode === 'edit' ? statusDefault : 'active'}
              required
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm text-fyh-text-secondary" htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={mode === 'edit' ? (service?.description ?? '') : ''}
              className={fieldClass}
              placeholder="Optional — notes for your team"
            />
          </div>
        </div>
      </section>

      {state.error && !nameDuplicate ? (
        <p className="text-sm text-fyh-danger">{state.error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Link href="/services">
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </Link>
      </div>
      </form>
    </div>
  );
}
