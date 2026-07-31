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

  return (
    <div className="mx-auto max-w-lg space-y-8 py-12 text-center">
      <div>
        <p className="fyh-section-eyebrow">Quick Sale</p>
        <h1 className="fyh-display mt-2 text-3xl font-semibold text-fyh-text">Sale complete</h1>
        <p className="mt-2 text-sm text-fyh-text-secondary">
          {customerName} · {formatInrFromPaise(grandTotalPaise)}
        </p>
        {advancePaise > 0 ? (
          <p className="mt-1 text-sm font-medium text-blue-400">
            Advance credited {formatInrFromPaise(advancePaise)}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {printHtml ? <PrintInvoiceButton html={printHtml} /> : null}
        {printHtml ? (
          <Button type="button" variant="secondary" onClick={() => window.print()}>
            Download PDF
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          disabled={loadingPreviews || !invoicePreview?.waUrl}
          onClick={() => openWa(invoicePreview?.waUrl)}
        >
          WhatsApp
        </Button>
        {googleReviewUrl ? (
          <Button
            type="button"
            variant="secondary"
            disabled={loadingPreviews || !reviewPreview?.waUrl}
            onClick={() => openWa(reviewPreview?.waUrl)}
          >
            Google Review
          </Button>
        ) : null}
        <Link href={`/billing/${invoiceId}`}>
          <Button type="button" variant="secondary">
            Open Invoice
          </Button>
        </Link>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </div>
      {!loadingPreviews && !invoicePreview?.waUrl ? (
        <p className="text-xs text-fyh-text-muted">
          WhatsApp preview unavailable — check customer phone and WhatsApp settings.
        </p>
      ) : null}
    </div>
  );
}
