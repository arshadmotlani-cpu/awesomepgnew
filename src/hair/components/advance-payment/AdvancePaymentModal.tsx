'use client';

import { useEffect } from 'react';
import { Button } from '@/src/hair/components/ui/button';
import { AdvancePaymentForm } from '@/src/hair/components/advance-payment/AdvancePaymentForm';

type Props = {
  open: boolean;
  onClose: () => void;
  initialCustomerId?: string | null;
};

export function AdvancePaymentModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fyh-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="fyh-modal-panel flex max-h-[min(92dvh,40rem)] w-[min(calc(100vw-1.5rem),28rem)] flex-col overflow-hidden sm:max-w-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="advance-payment-title"
      >
        <header className="fyh-modal-header flex shrink-0 items-center justify-between gap-2">
          <div>
            <p className="fyh-section-eyebrow">Customer credit</p>
            <h2 id="advance-payment-title" className="fyh-modal-title">Advance payment</h2>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </header>
        <div className="fyh-modal-body min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <AdvancePaymentForm compact onClose={onClose} onSuccess={() => onClose()} />
        </div>
      </div>
    </div>
  );
}
