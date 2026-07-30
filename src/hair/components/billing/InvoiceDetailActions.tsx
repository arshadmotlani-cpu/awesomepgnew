'use client';

import { useState, useTransition } from 'react';
import { getInvoiceSharePreviewAction } from '@/src/hair/actions/invoiceRegister';
import { PrintInvoiceButton } from '@/src/hair/components/billing/BillingUi';
import { Button } from '@/src/hair/components/ui/button';

type Props = {
  invoiceId: string;
  customerName: string;
  customerPhone: string;
  grandTotalPaise: number;
  printHtml: string;
};

export function InvoiceDetailActions({
  invoiceId,
  customerName,
  customerPhone,
  grandTotalPaise,
  printHtml,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pdfHref = `/fyh/api/invoices/${invoiceId}/print?download=1`;

  function openPreview() {
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    w.document.write(printHtml);
    w.document.close();
    w.focus();
  }

  function share() {
    setError(null);
    startTransition(async () => {
      const res = await getInvoiceSharePreviewAction({
        invoiceId,
        customerName,
        customerPhone,
        grandTotalPaise,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      window.open(res.waUrl, '_blank', 'noopener,noreferrer');
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={openPreview}>
          View invoice
        </Button>
        <a href={pdfHref} className="fyh-btn-secondary inline-flex h-9 items-center px-3 text-sm">
          Download PDF
        </a>
        <PrintInvoiceButton html={printHtml} />
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={share}>
          Share
        </Button>
      </div>
      {error ? <p className="text-xs text-fyh-danger">{error}</p> : null}
    </div>
  );
}
