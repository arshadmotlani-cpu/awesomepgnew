'use client';

import { useEffect, useState, useTransition } from 'react';
import { getInvoicePreviewAction } from '@/src/hair/actions/invoiceRegister';
import { PublicFyhInvoiceActions } from '@/src/hair/components/billing/PublicFyhInvoiceActions';
import {
  FYH_INVOICE_MODAL_PRINT_STYLES,
  FYH_INVOICE_MODAL_SCREEN_STYLES,
} from '@/src/hair/components/billing/fyhInvoiceModalStyles';
import { PUBLIC_INVOICE_STYLES } from '@/src/hair/lib/publicInvoiceDocument';

type PreviewData = {
  sheetHtml: string;
  invoiceNumber: string;
  publicAccessToken: string;
  customerName: string;
  customerPhone: string;
  grandTotalLabel: string;
};

type Props = {
  invoiceId: string | null;
  onClose: () => void;
};

export function InvoicePreviewModal({ invoiceId, onClose }: Props) {
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          <div className="fyh-invoice-page !min-h-0 !p-0">
            <div className="fyh-invoice-toolbar !mb-0 !max-w-none sticky top-0 z-10 flex items-center justify-end gap-2 rounded-t-lg border-b border-[#e8dcc8] bg-[#faf6ee] px-4 py-2.5">
              {preview ? (
                <PublicFyhInvoiceActions
                  invoiceNumber={preview.invoiceNumber}
                  publicAccessToken={preview.publicAccessToken}
                  customerPhone={preview.customerPhone}
                  customerName={preview.customerName}
                  grandTotalLabel={preview.grandTotalLabel}
                  onClose={onClose}
                />
              ) : pending ? (
                <span className="text-sm text-[#6b6358]">Loading…</span>
              ) : null}
            </div>
            <div className="fyh-invoice-modal-scroll bg-[#f7f5f0]">
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
                  <div dangerouslySetInnerHTML={{ __html: preview.sheetHtml }} />
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
