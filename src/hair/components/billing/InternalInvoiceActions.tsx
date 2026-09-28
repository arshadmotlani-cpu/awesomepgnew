'use client';

import { useState } from 'react';
import { invoicePublicViewUrl } from '@/src/hair/lib/invoicePublicLinks';
import { invoiceCanBeCancelled } from '@/src/hair/lib/billing/invoiceCancellationPlan';
import { Button } from '@/src/hair/components/ui/button';
import { InvoiceBillCorrectionDialog } from '@/src/hair/components/billing/InvoiceBillCorrection';

type Props = {
  invoiceId: string;
  invoiceNumber: string;
  publicAccessToken: string;
  status: string;
};

export function InternalInvoiceActions({
  invoiceId,
  invoiceNumber,
  publicAccessToken,
  status,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [correction, setCorrection] = useState<'edit' | 'cancel' | null>(null);
  const customerUrl = invoicePublicViewUrl(publicAccessToken);
  const canCorrect = invoiceCanBeCancelled(status);

  async function copyCustomerLink() {
    try {
      await navigator.clipboard.writeText(customerUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy customer invoice link:', customerUrl);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={customerUrl} target="_blank" rel="noopener noreferrer">
        <Button type="button" variant="secondary" size="sm">
          View
        </Button>
      </a>
      {canCorrect ? (
        <>
          <Button type="button" variant="secondary" size="sm" onClick={() => setCorrection('edit')}>
            Edit bill
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setCorrection('cancel')}>
            Cancel bill
          </Button>
        </>
      ) : null}
      <Button type="button" variant="ghost" size="sm" onClick={copyCustomerLink}>
        {copied ? 'Link copied' : 'Copy customer link'}
      </Button>
      {correction ? (
        <InvoiceBillCorrectionDialog
          invoiceId={invoiceId}
          invoiceNumber={invoiceNumber}
          mode={correction}
          onClose={() => setCorrection(null)}
        />
      ) : null}
    </div>
  );
}
