'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getNotificationPreviewAction } from '@/src/hair/actions/notifications';
import { PrintInvoiceButton } from '@/src/hair/components/billing/BillingUi';
import { Button } from '@/src/hair/components/ui/button';
import { formatInrFromPaise } from '@/src/hair/lib/money';

type Props = {
  invoiceId: string;
  invoiceNumber?: string;
  customerName: string;
  customerPhone: string;
  grandTotalPaise: number;
  advancePaise?: number;
  printHtml: string | null;
  googleReviewUrl?: string | null;
  onDone: () => void;
};

export function QuickSaleSuccessDialog({
  invoiceId,
  invoiceNumber,
  customerName,
  customerPhone,
  grandTotalPaise,
  advancePaise = 0,
  printHtml,
  googleReviewUrl,
  onDone,
}: Props) {
  const [invoicePreview, setInvoicePreview] = useState<{ body: string; waUrl: string } | null>(
    null,
  );
  const [reviewPreview, setReviewPreview] = useState<{ body: string; waUrl: string } | null>(null);
  const [loadingPreviews, setLoadingPreviews] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingPreviews(true);
      try {
        const [invoice, review] = await Promise.all([
          getNotificationPreviewAction({
            kind: 'whatsapp_invoice',
            customerName,
            customerPhone,
            grandTotalPaise,
            invoiceNumber,
          }),
          googleReviewUrl
            ? getNotificationPreviewAction({
                kind: 'review_request',
                customerName,
                customerPhone,
              })
            : Promise.resolve(null),
        ]);
        if (!cancelled) {
          setInvoicePreview(invoice);
          setReviewPreview(review);
        }
      } finally {
        if (!cancelled) setLoadingPreviews(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerName, customerPhone, grandTotalPaise, invoiceNumber, googleReviewUrl]);

  const openWa = (url: string | undefined) => {
    if (url) window.open(url, '_blank');
  };

  const title = invoiceNumber ? `Invoice ${invoiceNumber}` : 'Sale complete';

  return (
    <div className="fyh-invoice-modal-root fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-3 md:p-4">
      <button
        type="button"
        className="fyh-invoice-modal-backdrop fixed inset-0 bg-black/70"
        aria-label="Close sale result"
        onClick={onDone}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fyh-invoice-modal-panel relative z-[101] my-4 w-[min(95vw,240mm)]"
      >
        <div className="fyh-invoice-body overflow-hidden rounded-lg">
          <div className="fyh-invoice-page !min-h-0 !p-0">
            <div className="fyh-invoice-toolbar !mb-0 !max-w-none sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-t-lg border-b border-[#e8dcc8] bg-[#faf6ee] px-4 py-2.5">
              <div className="min-w-0 text-left">
                <p className="text-xs font-medium uppercase tracking-wide text-[#6b6358]">
                  Sale complete
                </p>
                <p className="truncate text-sm font-semibold text-[#2c2416]">
                  {customerName}
                  {invoiceNumber ? ` · ${invoiceNumber}` : ''}
                </p>
                <p className="text-sm tabular-nums text-[#6b6358]">
                  {formatInrFromPaise(grandTotalPaise)}
                  {advancePaise > 0
                    ? ` · Advance ${formatInrFromPaise(advancePaise)}`
                    : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {printHtml ? <PrintInvoiceButton html={printHtml} /> : null}
                {printHtml ? (
                  <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
                    Download PDF
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={loadingPreviews || !invoicePreview?.waUrl}
                  onClick={() => openWa(invoicePreview?.waUrl)}
                >
                  WhatsApp
                </Button>
                {googleReviewUrl ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={loadingPreviews || !reviewPreview?.waUrl}
                    onClick={() => openWa(reviewPreview?.waUrl)}
                  >
                    Google Review
                  </Button>
                ) : null}
                <Link href={`/billing/${invoiceId}`}>
                  <Button type="button" variant="secondary" size="sm">
                    Open Invoice
                  </Button>
                </Link>
                <Button type="button" size="sm" onClick={onDone}>
                  Done
                </Button>
              </div>
            </div>
            <div className="qs-success-invoice-scroll bg-[#f7f5f0]">
              {printHtml ? (
                <div
                  className="qs-success-invoice-sheet py-4"
                  dangerouslySetInnerHTML={{ __html: printHtml }}
                />
              ) : (
                <div className="space-y-3 px-6 py-16 text-center">
                  <p className="text-sm text-[#6b6358]">
                    Invoice saved successfully. Print preview is unavailable — open the invoice for
                    full details.
                  </p>
                  <Link href={`/billing/${invoiceId}`}>
                    <Button type="button" variant="secondary">
                      Open Invoice
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {!loadingPreviews && !invoicePreview?.waUrl ? (
        <p className="relative z-[102] mx-auto mb-4 max-w-md text-center text-xs text-fyh-text-muted">
          WhatsApp preview unavailable — check customer phone and WhatsApp settings.
        </p>
      ) : null}
    </div>
  );
}
