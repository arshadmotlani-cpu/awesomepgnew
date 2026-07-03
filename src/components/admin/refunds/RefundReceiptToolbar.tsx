'use client';

import { useActionState, useEffect } from 'react';
import {
  refundReceiptWhatsAppAction,
  type RefundReceiptActionState,
} from '@/app/(admin)/admin/refunds/receipt/actions';
import { FinancialDocumentToolbar } from '@/src/components/admin/FinancialDocumentToolbar';
import {
  depositRefundReceiptPrintHref,
  REFUND_CONSOLE_RETURN_PATH,
} from '@/src/lib/refund/refundReceiptLinks';

const initial: RefundReceiptActionState = { status: 'idle' };

export function RefundReceiptToolbar({
  settlementId,
  shareUrl,
}: {
  settlementId: string;
  shareUrl: string;
}) {
  const [state, action, pending] = useActionState(refundReceiptWhatsAppAction, initial);

  useEffect(() => {
    if (state.status === 'ok' && state.whatsappUrl) {
      window.open(state.whatsappUrl, '_blank', 'noopener,noreferrer');
    }
  }, [state]);

  return (
    <>
      <FinancialDocumentToolbar
        printHref={depositRefundReceiptPrintHref(settlementId)}
        shareUrl={shareUrl}
        whatsAppAction={(formData) => {
          formData.set('settlementId', settlementId);
          action(formData);
        }}
        whatsAppPending={pending}
        backHref={REFUND_CONSOLE_RETURN_PATH}
        backLabel="← Refund search"
      />
      {state.status === 'error' ? (
        <p className="mt-3 text-sm text-red-300">{state.message}</p>
      ) : null}
    </>
  );
}
