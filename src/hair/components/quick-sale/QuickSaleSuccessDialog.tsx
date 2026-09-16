'use client';

import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { CircleCheck, Loader2, X } from 'lucide-react';
import { getQuickSaleInvoicePreviewAction } from '@/src/hair/actions/quickSale';
import type { QuickSaleInvoicePreviewResult } from '@/src/hair/actions/quickSale';
import { PrintInvoiceButton } from '@/src/hair/components/billing/BillingUi';
import {
  FYH_INVOICE_MODAL_PRINT_STYLES,
  FYH_INVOICE_MODAL_SCREEN_STYLES,
  QS_INVOICE_VIEWER_SCREEN_STYLES,
} from '@/src/hair/components/billing/fyhInvoiceModalStyles';
import { Button } from '@/src/hair/components/ui/button';
import { invoicePublicPrintUrl, invoicePublicViewUrl } from '@/src/hair/lib/invoicePublicLinks';
import { FyhInvoicePreviewViewport } from '@/src/hair/components/billing/FyhInvoicePreviewViewport';
import { PUBLIC_INVOICE_STYLES } from '@/src/hair/lib/publicInvoiceDocument';

type PreviewData = Extract<QuickSaleInvoicePreviewResult, { ok: true }>;

type Props = {
  invoiceId: string;
  customerId: string;
  googleReviewUrl?: string | null;
  onDone: () => void;
};

function buildWhatsAppUrl(recipient: string, body: string): string {
  const digits = recipient.replace(/\D/g, '');
  return digits.length >= 10
    ? `https://wa.me/${digits}?text=${encodeURIComponent(body)}`
    : `https://wa.me/?text=${encodeURIComponent(body)}`;
}

export function QuickSaleSuccessDialog({
  invoiceId,
  customerId,
  googleReviewUrl,
  onDone,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const res = await getQuickSaleInvoicePreviewAction(invoiceId);
      if (cancelled) return;
      if (!res.ok) {
        setPreview(null);
        setError(res.error);
        return;
      }
      setError(null);
      setPreview(res);
    });
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('qs-invoice-viewer-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      document.body.classList.remove('qs-invoice-viewer-open');
    };
  }, [onDone]);

  const shareWhatsApp = () => {
    if (!preview) return;
    const publicUrl = invoicePublicViewUrl(preview.publicAccessToken);
    const body = `Hi ${preview.customerName}, your invoice ${preview.invoiceNumber} for ${preview.grandTotalLabel} is ready: ${publicUrl}`;
    window.open(buildWhatsAppUrl(preview.customerPhone, body), '_blank', 'noopener,noreferrer');
  };

  const shareGoogleReview = () => {
    if (!preview || !googleReviewUrl?.trim()) return;
    const body = `Hi ${preview.customerName}, thank you for visiting For Your Hair! We'd love your feedback: ${googleReviewUrl.trim()}`;
    window.open(buildWhatsAppUrl(preview.customerPhone, body), '_blank', 'noopener,noreferrer');
  };

  const title = preview ? `Invoice ${preview.invoiceNumber}` : 'Sale completed';

  const viewer = (
    <div
      className="qs-invoice-viewer-root"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="qs-invoice-viewer"
    >
      <header className="qs-invoice-viewer-header">
        <div className="qs-invoice-viewer-header-main">
          <div className="qs-invoice-viewer-icon" aria-hidden>
            <CircleCheck className="size-6" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="qs-invoice-viewer-eyebrow">Payment received</p>
            <h1 className="qs-invoice-viewer-title">Sale Completed</h1>
            {preview ? (
              <p className="qs-invoice-viewer-meta">
                <span className="font-medium">{preview.invoiceNumber}</span>
                <span className="qs-invoice-viewer-meta-sep">·</span>
                <span>{preview.invoiceDateTime}</span>
              </p>
            ) : pending ? (
              <p className="qs-invoice-viewer-meta flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading invoice…
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="qs-invoice-viewer-close"
          aria-label="Close"
          onClick={onDone}
        >
          <X className="size-5" aria-hidden />
        </button>
      </header>

      <div className="qs-invoice-viewer-body">
        <div className="qs-invoice-viewer-sheet-pane">
          {preview?.stylistName ? (
            <p className="qs-invoice-viewer-staff">
              <span className="font-medium">Staff:</span> {preview.stylistName}
            </p>
          ) : null}
          <div className="qs-invoice-viewer-sheet-wrap">
            {pending && !preview ? (
              <p className="qs-invoice-viewer-loading">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading invoice…
              </p>
            ) : null}
            {error ? (
              <div className="qs-invoice-viewer-error">
                <p>{error}</p>
                <p>Invoice saved successfully. Open the invoice for full details.</p>
                <Link href={`/billing/${invoiceId}`}>
                  <Button type="button" variant="secondary" size="sm">
                    Open Invoice
                  </Button>
                </Link>
              </div>
            ) : null}
            {preview ? (
              <>
                <style
                  dangerouslySetInnerHTML={{
                    __html:
                      PUBLIC_INVOICE_STYLES +
                      FYH_INVOICE_MODAL_SCREEN_STYLES +
                      QS_INVOICE_VIEWER_SCREEN_STYLES +
                      FYH_INVOICE_MODAL_PRINT_STYLES,
                  }}
                />
                <FyhInvoicePreviewViewport
                  className="fyh-invoice-preview-viewport qs-invoice-viewer-preview"
                  fitHeight
                >
                  <div dangerouslySetInnerHTML={{ __html: preview.sheetHtml }} />
                </FyhInvoicePreviewViewport>
              </>
            ) : null}
          </div>
        </div>

        <aside className="qs-invoice-viewer-actions" aria-label="Invoice actions">
          <div className="qs-invoice-viewer-action-grid">
            {preview ? (
              <PrintInvoiceButton html={preview.printDocumentHtml} label="Print Invoice" />
            ) : (
              <Button type="button" variant="secondary" size="sm" disabled>
                Print Invoice
              </Button>
            )}
            {preview ? (
              <a
                href={invoicePublicPrintUrl(preview.publicAccessToken)}
                target="_blank"
                rel="noopener noreferrer"
                className="qs-invoice-viewer-link-btn"
              >
                Download PDF
              </a>
            ) : (
              <Button type="button" variant="secondary" size="sm" disabled>
                Download PDF
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!preview}
              onClick={shareWhatsApp}
            >
              Share on WhatsApp
            </Button>
            {googleReviewUrl ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!preview}
                onClick={shareGoogleReview}
              >
                Google Review
              </Button>
            ) : null}
            <Link href={`/billing/${invoiceId}`} className="qs-invoice-viewer-action-span">
              <Button type="button" variant="secondary" size="sm" className="w-full">
                Open Invoice
              </Button>
            </Link>
            <Button
              type="button"
              size="sm"
              className="qs-invoice-viewer-action-span"
              onClick={onDone}
            >
              Done
            </Button>
          </div>
          <input type="hidden" name="customerId" value={customerId} readOnly aria-hidden />
        </aside>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(viewer, document.body);
}
