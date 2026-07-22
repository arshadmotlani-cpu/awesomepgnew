'use client';

import { useActionState } from 'react';
import {
  createCustomChargeAction,
  type CustomChargeActionState,
} from '@/app/(admin)/admin/residents/[customerId]/customChargeActions';
import { adminMoneyInputClassName, bindAdminMoneyInput } from '@/src/components/admin/AdminMoneyInput';

const CHARGE_KINDS = [
  { value: 'damage', label: 'Damage charge' },
  { value: 'penalty', label: 'Penalty' },
  { value: 'cleaning', label: 'Cleaning charge' },
  { value: 'maintenance', label: 'Maintenance charge' },
  { value: 'admin', label: 'Admin charge' },
  { value: 'custom', label: 'Custom charge' },
] as const;

const idle: CustomChargeActionState = { status: 'idle' };

export function CreateCustomChargeForm({
  customerId,
  bookingId,
}: {
  customerId: string;
  bookingId?: string | null;
}) {
  const [state, formAction, pending] = useActionState(createCustomChargeAction, idle);

  return (
    <form action={formAction} className="rounded-xl border border-white/10 bg-[#12161C] p-4">
      <input type="hidden" name="customerId" value={customerId} />
      {bookingId ? <input type="hidden" name="bookingId" value={bookingId} /> : null}
      <h3 className="text-sm font-semibold text-white">Create custom charge</h3>
      <p className="mt-1 text-[11px] text-apg-silver">
        Creates a financial invoice (OTHER) — appears in Command Center, Invoices, and outstanding
        totals via SSOT.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-apg-silver">
          Type
          <select
            name="kind"
            defaultValue="custom"
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
          >
            {CHARGE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-apg-silver">
          Amount (₹)
          <input
            {...bindAdminMoneyInput({ allowDecimal: true })}
            name="amountInr"
            required
            className={`mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white ${adminMoneyInputClassName}`}
          />
        </label>
        <label className="block text-xs text-apg-silver sm:col-span-2">
          Title
          <input
            type="text"
            name="title"
            required
            placeholder="e.g. Room damage — broken chair"
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-apg-silver sm:col-span-2">
          Description
          <textarea
            name="description"
            rows={2}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-apg-silver">
          Due date
          <input
            type="date"
            name="dueDate"
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-lg bg-[#FF5A1F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e04e18] disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create charge'}
      </button>

      {state.status === 'ok' ? (
        <p className="mt-2 text-xs text-emerald-300">{state.message}</p>
      ) : null}
      {state.status === 'error' ? (
        <p className="mt-2 text-xs text-rose-300">{state.message}</p>
      ) : null}
    </form>
  );
}
