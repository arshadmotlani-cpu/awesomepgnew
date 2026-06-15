'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import {
  cancelInvoiceAction,
  invoicePaymentLinkAction,
  invoiceWhatsAppAction,
  refundInvoiceAction,
  type InvoiceActionState,
} from '@/app/(admin)/admin/invoices/actions';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import type { FinancialInvoiceStatus } from '@/src/db/schema/enums';

const initial: InvoiceActionState = { status: 'idle' };

type Props = {
  invoiceId: string;
  status: FinancialInvoiceStatus;
  existingPaymentUrl?: string | null;
};

export function InvoiceDetailActions({ invoiceId, status, existingPaymentUrl }: Props) {
  const [cancelState, cancelFormAction, cancelPending] = useActionState(cancelInvoiceAction, initial);
  const [refundState, refundFormAction, refundPending] = useActionState(refundInvoiceAction, initial);
  const [linkState, linkFormAction, linkPending] = useActionState(invoicePaymentLinkAction, initial);
  const [waState, waFormAction, waPending] = useActionState(invoiceWhatsAppAction, initial);

  const paymentUrl =
    linkState.status === 'ok' && linkState.paymentUrl
      ? linkState.paymentUrl
      : existingPaymentUrl ?? null;
  const whatsappUrl =
    waState.status === 'ok' && waState.whatsappUrl ? waState.whatsappUrl : null;

  useEffect(() => {
    if (whatsappUrl) window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  }, [whatsappUrl]);

  const canCancel = status === 'sent' || status === 'overdue' || status === 'draft';
  const canRefund = status === 'paid';
  const canPay = status !== 'paid' && status !== 'cancelled' && status !== 'refunded';

  const feedback =
    cancelState.status === 'ok'
      ? cancelState.message
      : cancelState.status === 'error'
        ? cancelState.message
        : refundState.status === 'ok'
          ? refundState.message
          : refundState.status === 'error'
            ? refundState.message
            : linkState.status === 'ok'
              ? linkState.message
              : linkState.status === 'error'
                ? linkState.message
                : waState.status === 'error'
                  ? waState.message
                  : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {canPay ? (
          <>
            <form action={linkFormAction}>
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <button
                type="submit"
                disabled={linkPending}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/5 disabled:opacity-50"
              >
                {linkPending ? 'Creating…' : 'Generate payment link'}
              </button>
            </form>
            <form action={waFormAction}>
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <button
                type="submit"
                disabled={waPending}
                className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-3 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
              >
                <WhatsAppIcon className="h-4 w-4" />
                {waPending ? 'Opening…' : 'WhatsApp'}
              </button>
            </form>
          </>
        ) : null}
        {canCancel ? (
          <form action={cancelFormAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <input
              name="reason"
              placeholder="Cancellation reason"
              className="rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
            />
            <button
              type="submit"
              disabled={cancelPending}
              className="rounded-lg border border-red-500/40 px-3 py-2 text-sm font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50"
            >
              Cancel invoice
            </button>
          </form>
        ) : null}
        {canRefund ? (
          <form action={refundFormAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <input
              name="reason"
              placeholder="Refund reason"
              className="rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
            />
            <button
              type="submit"
              disabled={refundPending}
              className="rounded-lg border border-amber-500/40 px-3 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
            >
              Refund invoice
            </button>
          </form>
        ) : null}
      </div>

      {paymentUrl ? (
        <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
          <p className="text-xs uppercase text-apg-silver">Payment link</p>
          <Link
            href={paymentUrl}
            target="_blank"
            className="mt-1 block break-all text-sm text-[#FF5A1F] hover:underline"
          >
            {paymentUrl}
          </Link>
        </div>
      ) : null}

      {feedback ? (
        <p
          className={`text-sm ${feedback.includes('Could not') || feedback.includes('Missing') || feedback.includes('must') || feedback.includes('Only') ? 'text-red-300' : 'text-emerald-300'}`}
        >
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
