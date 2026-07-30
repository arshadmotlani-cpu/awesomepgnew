'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import {
  archiveVendorAction,
  createVendorAction,
  updateVendorAction,
  type InventoryActionState,
} from '@/src/hair/actions/inventory';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhVendor } from '@/src/hair/db/schema';

const initialState: InventoryActionState = {};
const fieldClass =
  'fyh-input w-full text-[0.8125rem] outline-none focus:border-fyh-accent/50';

export function VendorsList({
  vendors,
  q,
  status,
}: {
  vendors: FyhVendor[];
  q?: string;
  status?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-fyh-accent">
            Inventory
          </p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">Vendors</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Suppliers for purchase orders and goods receipts
          </p>
        </div>
        <Link href="/inventory/vendors/new">
          <Button type="button">
            <Plus className="mr-2 h-4 w-4" />
            Add vendor
          </Button>
        </Link>
      </div>

      <form method="get" className="fyh-glass flex flex-wrap items-end gap-3 p-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fyh-text-muted" />
          <Input name="q" defaultValue={q ?? ''} placeholder="Search vendors" className="pl-9" />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wide text-fyh-text-muted">Status</label>
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

      {vendors.length === 0 ? (
        <div className="fyh-glass px-6 py-16 text-center">
          <p className="fyh-display text-xl font-semibold">No vendors yet</p>
          <p className="mt-2 text-sm text-fyh-text-muted">Add suppliers to track purchases.</p>
          <Link href="/inventory/vendors/new" className="mt-6 inline-block">
            <Button type="button">Add vendor</Button>
          </Link>
        </div>
      ) : (
        <div className="fyh-glass overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[color:var(--fyh-border)] bg-black/20 text-xs uppercase tracking-wide text-fyh-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--fyh-border)]">
              {vendors.map((v) => (
                <tr key={v.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <Link
                      href={`/inventory/vendors/${v.id}`}
                      className="font-medium hover:text-fyh-accent"
                    >
                      {v.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-fyh-text-muted">{v.contactName || '—'}</td>
                  <td className="px-4 py-3 text-fyh-text-muted">{v.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={v.isActive ? 'text-fyh-success' : 'text-fyh-text-muted'}>
                      {v.isActive ? 'Active' : 'Archived'}
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

export function VendorForm({ mode, vendor }: { mode: 'create' | 'edit'; vendor?: FyhVendor }) {
  const action = mode === 'create' ? createVendorAction : updateVendorAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveVendorAction,
    initialState,
  );

  return (
    <div className="space-y-4">
      <form action={formAction} className="fyh-glass space-y-4 p-5">
        {mode === 'edit' && vendor ? <input type="hidden" name="id" value={vendor.id} /> : null}
        <input
          type="hidden"
          name="isActive"
          value={vendor?.isActive === false ? 'false' : 'true'}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm text-fyh-text-secondary" htmlFor="name">
              Name *
            </label>
            <Input id="name" name="name" required defaultValue={vendor?.name ?? ''} />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-fyh-text-secondary" htmlFor="contactName">
              Contact name
            </label>
            <Input id="contactName" name="contactName" defaultValue={vendor?.contactName ?? ''} />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-fyh-text-secondary" htmlFor="phone">
              Phone
            </label>
            <Input id="phone" name="phone" defaultValue={vendor?.phone ?? ''} />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-fyh-text-secondary" htmlFor="email">
              Email
            </label>
            <Input id="email" name="email" type="email" defaultValue={vendor?.email ?? ''} />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-fyh-text-secondary" htmlFor="gstin">
              GSTIN
            </label>
            <Input id="gstin" name="gstin" defaultValue={vendor?.gstin ?? ''} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm text-fyh-text-secondary" htmlFor="address">
              Address
            </label>
            <Input id="address" name="address" defaultValue={vendor?.address ?? ''} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm text-fyh-text-secondary" htmlFor="notes">
              Notes
            </label>
            <Input id="notes" name="notes" defaultValue={vendor?.notes ?? ''} />
          </div>
        </div>

        {state.error ? <p className="text-sm text-fyh-danger">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-fyh-success">{state.success}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : mode === 'create' ? 'Create vendor' : 'Save changes'}
          </Button>
          <Link href="/inventory/vendors">
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Link>
        </div>
      </form>

      {mode === 'edit' && vendor?.isActive ? (
        <form action={archiveAction} className="fyh-glass p-5">
          <input type="hidden" name="id" value={vendor.id} />
          <p className="text-sm text-fyh-text-secondary">Archive this vendor if no longer used.</p>
          {archiveState.error ? (
            <p className="mt-2 text-sm text-fyh-danger">{archiveState.error}</p>
          ) : null}
          <Button type="submit" variant="secondary" className="mt-3" disabled={archivePending}>
            Archive vendor
          </Button>
        </form>
      ) : null}
    </div>
  );
}
