'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { generatePaymentLinkAction } from '@/app/(admin)/admin/residents/paymentActions';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import { InvoiceWhatsAppShareButton } from '@/src/components/admin/InvoiceWhatsAppShareButton';
import { MarkAsPaidCashButton } from '@/src/components/admin/MarkAsPaidCashButton';
import { buildKycWhatsAppUrl, clientPublicSiteBaseUrl } from '@/src/lib/kyc/adminWhatsApp';
import { appAbsoluteUrl } from '@/src/lib/url';

const BTN =
  'inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-medium text-apg-silver hover:bg-white/5 hover:text-white disabled:opacity-50';

type Props = {
  customerId: string;
  customerName: string;
  phone: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  amountPaise: number;
  dueDate: string | null;
  bookingId?: string;
  financialInvoiceId?: string | null;
  canMarkCash?: boolean;
  adminName?: string;
  invoiceNumber?: string;
};

export function BillingOperationsRowActions({
  customerId,
  customerName,
  phone,
  pgId,
  pgName,
  roomNumber,
  amountPaise,
  dueDate,
  bookingId,
  financialInvoiceId,
  canMarkCash,
  adminName,
  invoiceNumber,
}: Props) {
  const [pending, startTransition] = useTransition();

  const callHref = phone ? `tel:${phone.replace(/\s/g, '')}` : null;

  function copyText(label: string, text: string) {
    void navigator.clipboard.writeText(text).then(
      () => window.alert(`${label} copied`),
      () => window.alert(`Could not copy ${label.toLowerCase()}`),
    );
  }

  function onWhatsAppWithLink() {
    if (amountPaise <= 0 || !dueDate) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set('residentId', customerId);
      fd.set('pgId', pgId);
      fd.set('pgName', pgName);
      fd.set('residentName', customerName);
      fd.set('residentPhone', phone);
      fd.set('amountPaise', String(amountPaise));
      fd.set('purpose', 'rent');
      fd.set('roomNumber', roomNumber);
      fd.set('dueDate', dueDate);

      const res = await generatePaymentLinkAction(fd);
      if (!res.ok) {
        window.alert(res.message);
        return;
      }
      const href =
        res.whatsappShareUrl ??
        buildKycWhatsAppUrl({
          phone,
          customerName,
          baseUrl: clientPublicSiteBaseUrl(),
        });
      if (href) window.open(href, '_blank', 'noopener,noreferrer');
    });
  }

  const invoiceUrl = financialInvoiceId
    ? appAbsoluteUrl(`/admin/invoices/${financialInvoiceId}`)
    : null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {financialInvoiceId ? (
        <Link href={`/admin/invoices/${financialInvoiceId}`} className={BTN}>
          View
        </Link>
      ) : (
        <Link href={`/admin/residents/${customerId}`} className={BTN}>
          View
        </Link>
      )}
      {financialInvoiceId ? (
        <InvoiceWhatsAppShareButton
          financialInvoiceId={financialInvoiceId}
          className={`${BTN} border-[#25D366]/40 text-[#25D366]`}
        />
      ) : (
        <button type="button" className={`${BTN} border-[#25D366]/40 text-[#25D366]`} disabled={pending} onClick={onWhatsAppWithLink}>
          <WhatsAppIcon className="h-3 w-3" />
          WhatsApp
        </button>
      )}
      {callHref ? (
        <a href={callHref} className={BTN}>
          Call
        </a>
      ) : null}
      {financialInvoiceId ? (
        <button
          type="button"
          className={BTN}
          disabled={pending}
          onClick={() => {
            if (!dueDate) return;
            startTransition(async () => {
              const fd = new FormData();
              fd.set('residentId', customerId);
              fd.set('pgId', pgId);
              fd.set('pgName', pgName);
              fd.set('residentName', customerName);
              fd.set('residentPhone', phone);
              fd.set('amountPaise', String(amountPaise));
              fd.set('purpose', 'rent');
              fd.set('roomNumber', roomNumber);
              fd.set('dueDate', dueDate);
              const res = await generatePaymentLinkAction(fd);
              if (!res.ok) {
                window.alert(res.message);
                return;
              }
              copyText('Payment link', res.publicUrl);
            });
          }}
        >
          Copy pay link
        </button>
      ) : null}
      {invoiceUrl ? (
        <button type="button" className={BTN} onClick={() => copyText('Invoice link', invoiceUrl)}>
          Copy invoice
        </button>
      ) : null}
      {canMarkCash && financialInvoiceId && adminName && invoiceNumber ? (
        <MarkAsPaidCashButton
          financialInvoiceId={financialInvoiceId}
          balanceDuePaise={amountPaise}
          residentName={customerName}
          invoiceNumber={invoiceNumber}
          adminName={adminName}
          canSettle
          compact
        />
      ) : null}
      {bookingId ? (
        <Link href={`/admin/bookings/${bookingId}`} className={BTN}>
          History
        </Link>
      ) : null}
    </div>
  );
}
