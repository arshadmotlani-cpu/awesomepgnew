'use client';

import { useEffect, useState, useTransition } from 'react';
import { getInvoicePreviewAction } from '@/src/hair/actions/invoiceRegister';
import { InvoiceBillCorrectionDialog } from '@/src/hair/components/billing/InvoiceBillCorrection';
import { PublicFyhInvoiceActions } from '@/src/hair/components/billing/PublicFyhInvoiceActions';
import { invoiceCanBeCancelled } from '@/src/hair/lib/billing/invoiceCancellationPlan';
import {
  FYH_INVOICE_MODAL_PRINT_STYLES,
  FYH_INVOICE_MODAL_SCREEN_STYLES,
} from '@/src/hair/components/billing/fyhInvoiceModalStyles';
import { FyhInvoicePreviewViewport } from '@/src/hair/components/billing/FyhInvoicePreviewViewport';
import { PUBLIC_INVOICE_STYLES } from '@/src/hair/lib/publicInvoiceDocument';

type PreviewData = {
  sheetHtml: string;
  invoiceNumber: string;
  publicAccessToken: string;
  customerName: string;
  customerPhone: string;
  grandTotalLabel: string;
  status: string;
};

type Props = {
  invoiceId: string | null;
  onClose: () => void;
};

export function InvoicePreviewModal({ invoiceId, onClose }: Props) {
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correction, setCorrection] = useState<'edit' | 'cancel' | null>(null);

  useEffect(() => {
    if (!invoiceId) {
      setPreview(null);
      setError(null);
      return;
    }

    let cancelled = false;
    startTransition(async () => {
      const res = await getInvoicePreviewAction(invoiceId);
      if (cancelled) return;
      if (!res.ok) {
        setPreview(null);
        setError(res.error);
        return;
      }
      setError(null);
      setPreview({
        sheetHtml: res.sheetHtml,
        invoiceNumber: res.invoiceNumber,
        publicAccessToken: res.publicAccessToken,
        customerName: res.customerName,
        customerPhone: res.customerPhone,
        grandTotalLabel: res.grandTotalLabel,
        status: res.status,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  useEffect(() => {
    if (!invoiceId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [invoiceId, onClose]);

  if (!invoiceId) return null;

  return (
    <div className="fyh-invoice-modal-root fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-3 md:p-4">
      <button
        type="button"
        className="fyh-invoice-modal-backdrop fixed inset-0 bg-black/70"
        aria-label="Close invoice preview"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={preview ? `Invoice ${preview.invoiceNumber}` : 'Invoice preview'}
        className="fyh-invoice-modal-panel relative z-[101] my-4 w-[min(95vw,240mm)]"
      >
        <div className="fyh-invoice-body overflow-hidden rounded-lg">
          <div className="fyh-invoice-page !min-h-0 !w-full !min-w-0 !max-w-full !overflow-hidden !p-0">
            <div className="fyh-invoice-toolbar !mb-0 !w-full !min-w-0 !max-w-full sticky top-0 z-10 flex items-center gap-2 rounded-t-lg border-b border-[#e8dcc8] bg-[#faf6ee] px-3 py-2.5">
              {preview ? (
                <>
                  <PublicFyhInvoiceActions
                    invoiceNumber={preview.invoiceNumber}
                    publicAccessToken={preview.publicAccessToken}
                    customerPhone={preview.customerPhone}
                    customerName={preview.customerName}
                    grandTotalLabel={preview.grandTotalLabel}
                    onClose={onClose}
                  />
                  {invoiceCanBeCancelled(preview.status) ? (
                    <>
                      <button type="button" className="fyh-invoice-btn" onClick={() => setCorrection('edit')}>
                        Edit bill
                      </button>
                      <button type="button" className="fyh-invoice-btn" onClick={() => setCorrection('cancel')}>
                        Cancel bill
                      </button>
                    </>
                  ) : null}
                </>
              ) : pending ? (
                <span className="text-sm text-[#6b6358]">Loading…</span>
              ) : null}
            </div>
            <div className="fyh-invoice-modal-scroll !w-full !min-w-0 bg-[#f7f5f0]">
              {pending && !preview ? (
                <p className="py-16 text-center text-sm text-[#6b6358]">Loading invoice…</p>
              ) : null}
              {error ? (
                <p className="py-16 text-center text-sm text-red-600">{error}</p>
              ) : null}
              {preview ? (
                <>
                  <style
                    dangerouslySetInnerHTML={{
                      __html:
                        PUBLIC_INVOICE_STYLES +
                        FYH_INVOICE_MODAL_SCREEN_STYLES +
                        FYH_INVOICE_MODAL_PRINT_STYLES,
                    }}
                  />
                  <FyhInvoicePreviewViewport className="fyh-invoice-modal-scroll fyh-invoice-preview-viewport">
                    <div dangerouslySetInnerHTML={{ __html: preview.sheetHtml }} />
                  </FyhInvoicePreviewViewport>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      {correction && preview ? (
        <InvoiceBillCorrectionDialog
          invoiceId={invoiceId}
          invoiceNumber={preview.invoiceNumber}
          mode={correction}
          onClose={() => setCorrection(null)}
        />
      ) : null}
    </div>
  );
}
