'use client';

import Link from 'next/link';
import { InvoiceWhatsAppShareButton } from '@/src/components/admin/InvoiceWhatsAppShareButton';

const OPEN_CLASS =
  'inline-flex items-center rounded-md border border-white/10 px-2 py-1 text-[11px] font-medium text-apg-silver hover:text-white';

type Props = {
  financialInvoiceId: string;
  /** Show WhatsApp for rent / electricity invoices (default true). */
  showWhatsApp?: boolean;
  compact?: boolean;
};

/** Standard admin invoice row actions — Open + WhatsApp for the same financial invoice. */
export function InvoiceAdminRowActions({
  financialInvoiceId,
  showWhatsApp = true,
  compact,
}: Props) {
  return (
    <div className={`flex flex-wrap justify-end gap-1 ${compact ? '' : ''}`}>
      <Link href={`/admin/invoices/${financialInvoiceId}`} className={OPEN_CLASS}>
        Open
      </Link>
      {showWhatsApp ? (
        <InvoiceWhatsAppShareButton financialInvoiceId={financialInvoiceId} />
      ) : null}
    </div>
  );
}
