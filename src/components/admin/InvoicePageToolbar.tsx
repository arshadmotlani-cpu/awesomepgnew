'use client';

import { useActionState, useEffect } from 'react';
import {
  invoiceWhatsAppAction,
  type InvoiceActionState,
} from '@/app/(admin)/admin/invoices/actions';
import { FinancialDocumentToolbar } from '@/src/components/admin/FinancialDocumentToolbar';

const initial: InvoiceActionState = { status: 'idle' };

export function InvoicePageToolbar({
  invoiceId,
  shareUrl,
  printHref,
  backHref,
  backLabel,
}: {
  invoiceId: string;
  shareUrl: string;
  printHref: string;
  backHref: string;
  backLabel: string;
}) {
  const [waState, waAction, waPending] = useActionState(invoiceWhatsAppAction, initial);

  useEffect(() => {
    if (waState.status === 'ok' && waState.whatsappUrl) {
      window.open(waState.whatsappUrl, '_blank', 'noopener,noreferrer');
    }
  }, [waState]);

  return (
    <>
      <FinancialDocumentToolbar
        printHref={printHref}
        shareUrl={shareUrl}
        whatsAppAction={(formData) => {
          formData.set('invoiceId', invoiceId);
          waAction(formData);
        }}
        whatsAppPending={waPending}
        backHref={backHref}
        backLabel={backLabel}
      />
      {waState.status === 'error' ? (
        <p className="mt-3 text-sm text-red-300">{waState.message}</p>
      ) : null}
    </>
  );
}
