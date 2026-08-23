'use client';

import { useState } from 'react';
import { invoicePublicViewUrl } from '@/src/hair/lib/invoicePublicLinks';
import { Button } from '@/src/hair/components/ui/button';

type Props = {
  invoiceNumber: string;
  publicAccessToken: string;
  status: string;
};

export function InternalInvoiceActions({ invoiceNumber, publicAccessToken, status }: Props) {
  const [copied, setCopied] = useState(false);
  const customerUrl = invoicePublicViewUrl(publicAccessToken);

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
          View Invoice
        </Button>
      </a>
      <Button type="button" variant="secondary" size="sm" onClick={copyCustomerLink}>
        {copied ? 'Link copied' : 'Copy customer link'}
      </Button>
      {status !== 'void' && status !== 'refunded' ? (
        <Button type="button" variant="ghost" size="sm" disabled title="Coming soon">
          Void
        </Button>
      ) : null}
      {status === 'paid' ? (
        <Button type="button" variant="ghost" size="sm" disabled title="Coming soon">
          Refund
        </Button>
      ) : null}
    </div>
  );
}
