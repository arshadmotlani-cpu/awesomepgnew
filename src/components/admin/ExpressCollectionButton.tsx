'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import {
  recordExpressCollectionAction,
  type ExpressCollectionActionState,
} from '@/app/(admin)/admin/residents/[customerId]/expressCollectionActions';
import type { ResidentBillingFormDefaults } from '@/src/services/residentBillingProfiles';
import {
  EXPRESS_COLLECTION_CHARGE_TYPES,
  EXPRESS_COLLECTION_PAYMENT_METHODS,
  type ExpressCollectionChargeType,
} from '@/src/lib/billing/expressCollectionConstants';
import { formatDate } from '@/src/lib/format';

const idle: ExpressCollectionActionState = { status: 'idle' };

type Props = {
  customerId: string;
  bookingId?: string | null;
  customerName: string;
  billingDefaults?: ResidentBillingFormDefaults | null;
  defaultOpen?: boolean;
  onClose?: () => void;
  triggerClassName?: string;
  triggerLabel?: string;
};

export function ExpressCollectionButton({
  customerId,
  bookingId,
  customerName,
  billingDefaults,
  defaultOpen = false,
  onClose,
  triggerClassName,
  triggerLabel = 'Record payment received',
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(recordExpressCollectionAction, idle);
  const [chargeType, setChargeType] = useState<ExpressCollectionChargeType>('rent');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  useEffect(() => {
    if (state.status === 'ok') {
      const t = setTimeout(() => {
        setOpen(false);
        onClose?.();
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [state.status, onClose]);

  const needsBillingMonth = chargeType === 'rent' || chargeType === 'electricity';
  const needsTitle = chargeType === 'custom';
  const today = formatDate(new Date());
  const defaultAmountInr = billingDefaults
    ? (billingDefaults.rentAmountPaise / 100).toFixed(2)
    : '';
  const defaultBillingMonth = billingDefaults?.billingMonth?.slice(0, 7) ?? '';
  const defaultPaymentMethod = billingDefaults?.defaultPaymentMethod ?? 'cash';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          'rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20'
        }
      >
        {triggerLabel}
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#1A1F27] p-0 text-white shadow-2xl backdrop:bg-black/60"
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
      >
        <form action={formAction} className="p-5">
          <input type="hidden" name="customerId" value={customerId} />
          {bookingId ? <input type="hidden" name="bookingId" value={bookingId} /> : null}
          <input type="hidden" name="createAsPaid" value="on" />

          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Record payment received</h2>
              <p className="mt-1 text-[11px] text-apg-silver">
                Use this when {customerName} already paid you (cash, UPI, or bank transfer). The
                amount is attached to their existing bill — it does not create a new invoice.
              </p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded border border-white/10 px-2 py-1 text-xs text-apg-silver hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-apg-silver sm:col-span-2">
              Charge type
              <select
                name="chargeType"
                value={chargeType}
                onChange={(e) => setChargeType(e.target.value as ExpressCollectionChargeType)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
              >
                {EXPRESS_COLLECTION_CHARGE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-apg-silver">
              Amount (₹)
              <input
                type="number"
                name="amountInr"
                min="0.01"
                step="0.01"
                required
                defaultValue={defaultAmountInr || undefined}
                placeholder="3570"
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="block text-xs text-apg-silver">
              Payment date
              <input
                type="date"
                name="paymentDate"
                required
                defaultValue={today}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
              />
            </label>

            {needsBillingMonth ? (
              <label className="block text-xs text-apg-silver sm:col-span-2">
                Billing month
                <input
                  type="month"
                  name="billingMonth"
                  required
                  defaultValue={defaultBillingMonth || undefined}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
                />
              </label>
            ) : null}

            <label className="block text-xs text-apg-silver sm:col-span-2">
              Payment method
              <select
                name="paymentMethod"
                defaultValue={defaultPaymentMethod}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
              >
                {EXPRESS_COLLECTION_PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            {needsTitle ? (
              <label className="block text-xs text-apg-silver sm:col-span-2">
                Charge title
                <input
                  type="text"
                  name="customTitle"
                  required
                  placeholder="Cleaning fee"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
                />
              </label>
            ) : null}

            <label className="block text-xs text-apg-silver sm:col-span-2">
              Reference number (optional)
              <input
                type="text"
                name="referenceNumber"
                placeholder="UPI ref, receipt no."
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="block text-xs text-apg-silver sm:col-span-2">
              Notes (optional)
              <textarea
                name="notes"
                rows={2}
                placeholder="Collected in cash before platform launch"
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
              />
            </label>
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs text-apg-silver">
            <input type="checkbox" checked readOnly disabled className="rounded border-white/20" />
            Create as paid (historical collection)
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {pending ? 'Recording…' : 'Record payment'}
            </button>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-lg border border-white/10 px-4 py-2 text-xs text-apg-silver hover:text-white"
            >
              Cancel
            </button>
          </div>

          {state.status === 'ok' ? (
            <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {state.message}
            </p>
          ) : null}
          {state.status === 'error' ? (
            <p className="mt-3 text-xs text-rose-300">{state.message}</p>
          ) : null}
        </form>
      </dialog>
    </>
  );
}
