'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  markInvoicePaidWithCashAction,
  type CashSettlementActionState,
} from '@/app/(admin)/admin/invoices/cash-settlement-actions';
import { paiseToInr } from '@/src/lib/format';

const initial: CashSettlementActionState = { status: 'idle' };

export function MarkAsPaidCashButton({
  financialInvoiceId,
  balanceDuePaise,
  residentName,
  invoiceNumber,
  adminName,
  canSettle,
  blockReason,
  compact,
}: {
  financialInvoiceId: string;
  balanceDuePaise: number;
  residentName: string;
  invoiceNumber: string;
  adminName: string;
  canSettle: boolean;
  blockReason?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [state, formAction, pending] = useActionState(markInvoicePaidWithCashAction, initial);

  useEffect(() => {
    if (state.status === 'ok') {
      setOpen(false);
      setNotes('');
    }
  }, [state]);

  if (!canSettle) {
    return blockReason ? (
      <p className="text-xs text-apg-silver">{blockReason}</p>
    ) : null;
  }

  const receivedOn = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? 'inline-flex min-h-[36px] items-center justify-center rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20'
            : 'inline-flex min-h-11 items-center justify-center rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20'
        }
      >
        Mark as Paid (Cash)
      </button>

      {open ? (
        <div className="fixed inset-0 z-[400] flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cash-settle-title"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1A1F27] p-6 shadow-2xl"
          >
            <h2 id="cash-settle-title" className="text-lg font-semibold text-white">
              Mark as Paid (Cash)
            </h2>
            <p className="mt-1 text-sm text-apg-silver">
              {residentName} · {invoiceNumber}
            </p>

            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-apg-silver">Amount</dt>
                <dd className="font-semibold tabular-nums text-white">{paiseToInr(balanceDuePaise)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-apg-silver">Payment mode</dt>
                <dd className="text-white">Cash</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-apg-silver">Received by</dt>
                <dd className="text-white">{adminName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-apg-silver">Received on</dt>
                <dd className="text-right text-white">{receivedOn}</dd>
              </div>
            </dl>

            <label className="mt-4 block text-xs text-apg-silver">
              Optional notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Cash collected at reception"
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#121820] px-3 py-2 text-sm text-white"
              />
            </label>

            {state.status === 'error' ? (
              <p className="mt-3 text-sm text-rose-300">{state.message}</p>
            ) : null}
            {state.status === 'ok' ? (
              <p className="mt-3 text-sm text-emerald-300">{state.message}</p>
            ) : null}

            <form action={formAction} className="mt-5 flex flex-wrap gap-2">
              <input type="hidden" name="financialInvoiceId" value={financialInvoiceId} />
              <input type="hidden" name="notes" value={notes} />
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {pending ? 'Recording…' : 'Confirm cash payment'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-white/15 px-4 py-2.5 text-sm text-apg-silver hover:text-white"
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
