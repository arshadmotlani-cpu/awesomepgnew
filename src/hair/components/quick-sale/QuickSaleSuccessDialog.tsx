'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { CalendarPlus, CircleCheck, Loader2, UserRound, X } from 'lucide-react';
import { getQuickSaleInvoicePreviewAction } from '@/src/hair/actions/quickSale';
import type { QuickSaleInvoicePreviewResult } from '@/src/hair/actions/quickSale';
import { PrintInvoiceButton } from '@/src/hair/components/billing/BillingUi';
import {
  FYH_INVOICE_MODAL_PRINT_STYLES,
  FYH_INVOICE_MODAL_SCREEN_STYLES,
} from '@/src/hair/components/billing/fyhInvoiceModalStyles';
import { Button } from '@/src/hair/components/ui/button';
import { invoicePublicPrintUrl, invoicePublicViewUrl } from '@/src/hair/lib/invoicePublicLinks';
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
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
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

  return (
    <div className="qs-success-root fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-3 md:p-6">
      <button
        type="button"
        className="qs-success-backdrop fixed inset-0 bg-black/70"
        aria-label="Close sale result"
        onClick={onDone}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="qs-success-panel relative z-[101] my-4 w-full max-w-6xl"
      >
        <div className="overflow-hidden rounded-2xl border border-[color:var(--fyh-border)] bg-[var(--fyh-bg-elevated)] shadow-2xl shadow-black/25">
          <header className="qs-success-header relative border-b border-fyh-accent/20 bg-fyh-accent/10 px-5 py-5 md:px-6 md:py-6">
            <button
              type="button"
              className="qs-success-close absolute right-4 top-4 rounded-lg p-1.5 text-fyh-text-muted transition hover:bg-black/5 hover:text-fyh-text"
              aria-label="Close"
              onClick={onDone}
            >
              <X className="size-5" aria-hidden />
            </button>
            <div className="flex items-start gap-4 pr-10">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-fyh-accent/15 text-fyh-accent">
                <CircleCheck className="size-7" strokeWidth={2} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="fyh-section-eyebrow text-fyh-accent">Payment received successfully</p>
                <h1 className="fyh-display mt-1 text-2xl font-semibold text-fyh-text md:text-3xl">
                  Sale Completed
                </h1>
                {preview ? (
                  <p className="mt-2 text-sm text-fyh-text-secondary">
                    <span className="font-medium text-fyh-text">{preview.invoiceNumber}</span>
                    <span className="mx-2 text-fyh-text-muted">·</span>
                    <span>{preview.invoiceDateTime}</span>
                  </p>
                ) : pending ? (
                  <p className="mt-2 flex items-center gap-2 text-sm text-fyh-text-muted">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Loading invoice…
                  </p>
                ) : null}
              </div>
            </div>
          </header>

          <div className="qs-success-body grid gap-0 lg:grid-cols-[1fr_280px]">
            <div className="min-w-0 border-b border-[color:var(--fyh-border)] lg:border-b-0 lg:border-r">
              {preview?.stylistName ? (
                <div className="border-b border-[color:var(--fyh-border)] bg-[#faf6ee] px-4 py-2.5 text-sm text-[#6b6358] md:px-5">
                  <span className="font-medium text-[#2c2416]">Staff:</span>{' '}
                  {preview.stylistName}
                </div>
              ) : null}
              <div className="qs-success-invoice-scroll bg-[#f7f5f0]">
                {pending && !preview ? (
                  <p className="flex items-center justify-center gap-2 py-20 text-sm text-[#6b6358]">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Loading invoice…
                  </p>
                ) : null}
                {error ? (
                  <div className="space-y-3 px-6 py-16 text-center">
                    <p className="text-sm text-red-600">{error}</p>
                    <p className="text-sm text-[#6b6358]">
                      Invoice saved successfully. Open the invoice for full details.
                    </p>
                    <Link href={`/billing/${invoiceId}`}>
                      <Button type="button" variant="secondary">
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
                          FYH_INVOICE_MODAL_PRINT_STYLES,
                      }}
                    />
                    <div dangerouslySetInnerHTML={{ __html: preview.sheetHtml }} />
                  </>
                ) : null}
              </div>
            </div>

            <aside className="qs-success-actions flex flex-col gap-4 p-4 md:p-5 lg:sticky lg:top-0 lg:self-start">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
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
                    className="inline-flex h-8 min-h-8 items-center justify-center rounded-[var(--fyh-radius)] border border-[color:var(--fyh-border-strong)] bg-[color:var(--fyh-bg-surface)] px-2.5 text-xs font-semibold text-fyh-text transition hover:border-[color:var(--fyh-border-hover)] hover:bg-[color:var(--fyh-bg-elevated)] md:h-9 md:min-h-9"
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
                <Link href={`/billing/${invoiceId}`} className="col-span-2 lg:col-span-1">
                  <Button type="button" variant="secondary" size="sm" className="w-full">
                    Open Invoice
                  </Button>
                </Link>
                <Button
                  type="button"
                  size="sm"
                  className="col-span-2 lg:col-span-1"
                  onClick={onDone}
                >
                  Done
                </Button>
              </div>

              <div className="border-t border-[color:var(--fyh-border)] pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fyh-text-muted">
                  Customer
                </p>
                <div className="flex flex-col gap-2">
                  <Link href={`/customers/${customerId}`}>
                    <Button type="button" variant="ghost" size="sm" className="w-full justify-start gap-2">
                      <UserRound className="size-4 shrink-0" aria-hidden />
                      View Customer
                    </Button>
                  </Link>
                  <Link href={`/appointments?customerId=${customerId}`}>
                    <Button type="button" variant="ghost" size="sm" className="w-full justify-start gap-2">
                      <CalendarPlus className="size-4 shrink-0" aria-hidden />
                      Create Next Appointment
                    </Button>
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
