'use client';

import Link from 'next/link';
import { PrintInvoiceButton } from '@/src/hair/components/billing/BillingUi';
import { Button } from '@/src/hair/components/ui/button';
import { formatInrFromPaise } from '@/src/hair/lib/money';

type Props = {
  invoiceId: string;
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
  customerName,
  customerPhone,
  grandTotalPaise,
  advancePaise = 0,
  printHtml,
  googleReviewUrl,
  onDone,
}: Props) {
  const invoiceUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/billing/${invoiceId}`
      : `/billing/${invoiceId}`;

  const whatsappInvoice = () => {
    const text = encodeURIComponent(
      `Hi ${customerName}, your invoice for ${formatInrFromPaise(grandTotalPaise)} is ready: ${invoiceUrl}`,
    );
    window.open(`https://wa.me/${customerPhone.replace(/\D/g, '')}?text=${text}`, '_blank');
  };

  const whatsappReview = () => {
    const reviewPart = googleReviewUrl ? `\n\nLeave us a review: ${googleReviewUrl}` : '';
    const text = encodeURIComponent(
      `Hi ${customerName}, thank you for visiting For Your Hair! We'd love your feedback.${reviewPart}`,
    );
    window.open(`https://wa.me/${customerPhone.replace(/\D/g, '')}?text=${text}`, '_blank');
  };

  return (
    <div className="mx-auto max-w-lg space-y-8 py-12 text-center">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-fyh-accent">Quick Sale</p>
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
        <Button type="button" variant="secondary" onClick={whatsappInvoice}>
          WhatsApp
        </Button>
        {googleReviewUrl ? (
          <Button type="button" variant="secondary" onClick={whatsappReview}>
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
    </div>
  );
}
