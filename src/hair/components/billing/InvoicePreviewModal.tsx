'use client';

import { useEffect, useState, useTransition } from 'react';
import { getInvoicePreviewAction } from '@/src/hair/actions/invoiceRegister';
import { PublicFyhInvoiceActions } from '@/src/hair/components/billing/PublicFyhInvoiceActions';
import { PUBLIC_INVOICE_STYLES } from '@/src/hair/lib/publicInvoiceDocument';

type PreviewData = {
  sheetHtml: string;
  invoiceNumber: string;
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
                      __html: PUBLIC_INVOICE_STYLES + MODAL_SCREEN_STYLES + MODAL_PRINT_STYLES,
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

const MODAL_SCREEN_STYLES = `
.fyh-invoice-modal-scroll {
  overflow: auto;
  max-height: calc(92vh - 3.5rem);
  padding: 16px 0 24px;
}
.fyh-invoice-modal-panel .fyh-invoice-sheet {
  width: 210mm;
  min-width: 210mm;
  max-width: 210mm;
  margin: 0 auto;
}
.fyh-invoice-modal-panel .fyh-invoice-body {
  overflow-x: auto;
}
`;

const MODAL_PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  .fyh-invoice-modal-root,
  .fyh-invoice-modal-root * { visibility: visible !important; }
  .fyh-invoice-modal-backdrop,
  .fyh-invoice-modal-panel > .fyh-invoice-body > .fyh-invoice-page > .fyh-invoice-toolbar {
    display: none !important;
  }
  .fyh-invoice-modal-root {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    padding: 0 !important;
    background: #fff !important;
  }
  .fyh-invoice-modal-panel {
    max-width: none !important;
    width: 100% !important;
  }
  .fyh-invoice-modal-scroll {
    max-height: none !important;
    overflow: visible !important;
    padding: 0 !important;
    background: #fff !important;
  }
}
`;
