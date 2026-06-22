'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  cancelInvoiceAction,
  invoiceWhatsAppAction,
  voidInvoiceCompletelyAction,
  type InvoiceActionState,
} from '@/app/(admin)/admin/invoices/actions';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import type { FinancialInvoiceStatus } from '@/src/db/schema/enums';

const initial: InvoiceActionState = { status: 'idle' };

type Props = {
  invoiceId: string;
  status: FinancialInvoiceStatus;
  canVoidExpressSale?: boolean;
  bookingCode?: string | null;
};

export function InvoiceDetailActions({
  invoiceId,
  status,
  canVoidExpressSale = false,
  bookingCode,
}: Props) {
  const [cancelState, cancelFormAction, cancelPending] = useActionState(cancelInvoiceAction, initial);
  const [voidState, voidFormAction, voidPending] = useActionState(voidInvoiceCompletelyAction, initial);
  const [waState, waFormAction, waPending] = useActionState(invoiceWhatsAppAction, initial);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const whatsappUrl = waState.status === 'ok' && waState.whatsappUrl ? waState.whatsappUrl : null;

  useEffect(() => {
    if (whatsappUrl) window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  }, [whatsappUrl]);

  const canCancel =
    status !== 'paid' &&
    status !== 'refunded' &&
    status !== 'cancelled' &&
    (status === 'sent' || status === 'overdue' || status === 'draft' || status === 'expired');

  const cancelBlockedReason =
    status === 'paid'
      ? 'Paid invoices cannot be cancelled — use refund or advanced void for express sales.'
      : status === 'refunded' || status === 'cancelled'
        ? `Invoice is already ${status}.`
        : null;

  const feedback =
    voidState.status === 'ok'
      ? voidState.message
      : voidState.status === 'error'
        ? voidState.message
        : cancelState.status === 'ok'
          ? cancelState.message
          : cancelState.status === 'error'
            ? cancelState.message
            : waState.status === 'error'
              ? waState.message
              : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <form action={waFormAction}>
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <button
            type="submit"
            disabled={waPending}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50 sm:w-auto"
          >
            <WhatsAppIcon className="h-4 w-4" />
            {waPending ? 'Opening…' : 'Send on WhatsApp'}
          </button>
        </form>

        {canCancel ? (
          showCancelConfirm ? (
            <form action={cancelFormAction} className="flex flex-wrap items-end gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <div className="w-full">
                <p className="text-xs font-medium text-red-100">Cancel this invoice?</p>
                <p className="mt-1 text-[11px] text-red-200/80">
                  This cannot be undone. Outstanding balances will update automatically.
                </p>
              </div>
              <input
                name="reason"
                required
                placeholder="Cancellation reason"
                className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
              />
              <button
                type="submit"
                disabled={cancelPending}
                className="rounded-lg border border-red-500/50 bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/25 disabled:opacity-50"
              >
                {cancelPending ? 'Cancelling…' : 'Confirm cancel'}
              </button>
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-apg-silver hover:text-white"
              >
                Back
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/10"
            >
              Cancel invoice
            </button>
          )
        ) : cancelBlockedReason ? (
          <p className="self-center text-xs text-apg-silver">{cancelBlockedReason}</p>
        ) : null}
      </div>

      {canVoidExpressSale ? (
        <>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 lg:hidden">
            <p className="text-sm font-medium text-amber-100">Express walk-in — void sale</p>
            <p className="mt-1 text-xs text-amber-200/90">
              Void removes this invoice, cancels booking {bookingCode ? `(${bookingCode})` : ''}, clears
              deposit wallet entries, frees the bed, and archives the resident profile.
            </p>
            <form action={voidFormAction} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <input
                name="reason"
                required
                placeholder="Why void this sale?"
                className="w-full rounded-lg border border-white/10 bg-[#12161D] px-3 py-2.5 text-base text-white"
              />
              <button
                type="submit"
                disabled={voidPending}
                className="min-h-11 rounded-lg border border-red-500/50 bg-red-500/15 px-3 py-2.5 text-sm font-semibold text-red-100 hover:bg-red-500/25 disabled:opacity-50"
              >
                {voidPending ? 'Voiding…' : 'Void sale & remove all traces'}
              </button>
            </form>
          </div>

          <details className="hidden rounded-xl border border-white/10 bg-[#12161C] lg:block">
            <summary className="cursor-pointer px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver hover:text-white">
              Advanced
            </summary>
            <div className="border-t border-white/10 p-4">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm font-medium text-amber-100">Express walk-in — void sale</p>
                <p className="mt-1 text-xs text-amber-200/90">
                  Void removes this invoice, cancels booking {bookingCode ? `(${bookingCode})` : ''},
                  clears deposit wallet entries, frees the bed, and archives the resident profile.
                </p>
                <form action={voidFormAction} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="invoiceId" value={invoiceId} />
                  <input
                    name="reason"
                    required
                    placeholder="Why void this sale?"
                    className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
                  />
                  <button
                    type="submit"
                    disabled={voidPending}
                    className="rounded-lg border border-red-500/50 bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/25 disabled:opacity-50"
                  >
                    {voidPending ? 'Voiding…' : 'Void sale & remove all traces'}
                  </button>
                </form>
              </div>
            </div>
          </details>
        </>
      ) : null}

      {feedback ? (
        <p
          className={`text-sm ${feedback.includes('Could not') || feedback.includes('Missing') || feedback.includes('must') || feedback.includes('Only') || feedback.includes('already') || feedback.includes('cannot') ? 'text-red-300' : 'text-emerald-300'}`}
        >
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
