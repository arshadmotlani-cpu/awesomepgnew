'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelInvoiceAction } from '@/src/hair/actions/invoiceLifecycle';
import { Button } from '@/src/hair/components/ui/button';
import { invoiceCanBeCancelled } from '@/src/hair/lib/billing/invoiceCancellationPlan';

type Mode = 'edit' | 'cancel';

export function InvoiceBillCorrectionDialog({
  invoiceId,
  invoiceNumber,
  mode,
  onClose,
}: {
  invoiceId: string;
  invoiceNumber: string;
  mode: Mode;
  onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = mode === 'edit';

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await cancelInvoiceAction({ invoiceId, reason });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (editing) {
        router.push('/quick-sale');
        router.refresh();
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[800] flex items-end justify-center sm:items-center" role="presentation">
      <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-correction-title"
        className="relative z-[801] w-full max-w-md rounded-t-2xl border border-[color:var(--fyh-border-strong)] bg-fyh-elevated p-4 shadow-xl sm:rounded-2xl"
      >
        <h2 id="invoice-correction-title" className="text-base font-semibold text-fyh-text">
          {editing ? `Edit bill ${invoiceNumber}` : `Cancel bill ${invoiceNumber}`}
        </h2>
        <p className="mt-2 text-sm text-fyh-text-secondary">
          {editing
            ? 'An issued bill is not rewritten. Cancelling keeps the original invoice, payments, and staff lines, then you create a corrected bill in Express Sale.'
            : 'Cancelling keeps this invoice for audit. It will no longer count as a paid or open bill. Payments and staff lines stay on the record.'}
        </p>
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-fyh-text-muted" htmlFor="invoice-cancel-reason">
          Reason
        </label>
        <textarea
          id="invoice-cancel-reason"
          className="mt-1 w-full rounded-lg border border-[color:var(--fyh-border)] bg-black/20 px-3 py-2 text-sm text-fyh-text"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What needs to be corrected?"
        />
        {error ? <p className="mt-2 text-sm text-fyh-danger">{error}</p> : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Back
          </Button>
          <Button type="button" size="sm" onClick={submit} disabled={pending || reason.trim().length < 3}>
            {pending ? 'Saving…' : editing ? 'Cancel and create replacement' : 'Cancel bill'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function InvoiceCorrectionMenuItems({
  status,
  onEdit,
  onCancel,
}: {
  status: string;
  onEdit: () => void;
  onCancel: () => void;
}) {
  if (!invoiceCanBeCancelled(status)) return null;
  return (
    <>
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center px-3 py-2.5 text-left text-sm text-fyh-text hover:bg-white/6"
        onClick={onEdit}
      >
        Edit bill
      </button>
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center px-3 py-2.5 text-left text-sm text-fyh-danger hover:bg-white/6"
        onClick={onCancel}
      >
        Cancel bill
      </button>
    </>
  );
}
