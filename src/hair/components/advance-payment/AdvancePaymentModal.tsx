'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/src/hair/components/ui/button';
import { AdvancePaymentForm } from '@/src/hair/components/advance-payment/AdvancePaymentForm';
import { AdvancePaymentReceiptViewer } from '@/src/hair/components/advance-payment/AdvancePaymentReceiptViewer';
import { ADVANCE_RECEIVE_PERMISSION_DENIED_MESSAGE } from '@/src/hair/lib/advancePaymentPermissions';

type Props = {
  open: boolean;
  onClose: () => void;
  canReceiveAdvance: boolean;
  initialCustomerId?: string | null;
};

export function AdvancePaymentModal({
  open,
  onClose,
  canReceiveAdvance,
}: Props) {
  const [receiptInvoiceId, setReceiptInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) setReceiptInvoiceId(null);
  }, [open]);

  const handleCloseAll = () => {
    setReceiptInvoiceId(null);
    onClose();
  };

  if (!open) return null;

  if (receiptInvoiceId) {
    return (
      <AdvancePaymentReceiptViewer
        invoiceId={receiptInvoiceId}
        onClose={handleCloseAll}
      />
    );
  }

  return (
    <div
      className="fyh-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCloseAll();
      }}
    >
      <div
        className="fyh-modal-panel flex max-h-[min(92dvh,40rem)] w-[min(calc(100vw-1.5rem),28rem)] flex-col overflow-hidden sm:max-w-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="advance-payment-title"
        data-testid="advance-payment-modal"
      >
        <header className="fyh-modal-header flex shrink-0 items-center justify-between gap-2">
          <div>
            <p className="fyh-section-eyebrow">Customer credit</p>
            <h2 id="advance-payment-title" className="fyh-modal-title">
              Advance payment
            </h2>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={handleCloseAll} aria-label="Close">
            Close
          </Button>
        </header>
        <div className="fyh-modal-body min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {!canReceiveAdvance ? (
            <p className="text-sm text-fyh-danger" data-testid="advance-payment-permission-denied">
              {ADVANCE_RECEIVE_PERMISSION_DENIED_MESSAGE}
            </p>
          ) : (
            <AdvancePaymentForm
              compact
              onClose={handleCloseAll}
              onSuccess={(result) => {
                setReceiptInvoiceId(result.invoiceId);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
