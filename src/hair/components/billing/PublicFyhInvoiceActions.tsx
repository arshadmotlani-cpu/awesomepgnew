'use client';

import { invoicePublicPrintUrl, invoicePublicViewUrl } from '@/src/hair/lib/invoicePublicLinks';

function buildWhatsAppUrl(recipient: string, body: string): string {
  const digits = recipient.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
}

type Props = {
  invoiceNumber: string;
  customerPhone: string;
  customerName: string;
  grandTotalLabel: string;
};

export function PublicFyhInvoiceActions({
  invoiceNumber,
  customerPhone,
  customerName,
  grandTotalLabel,
}: Props) {
  const pdfUrl = invoicePublicPrintUrl(invoiceNumber);
  const publicUrl = invoicePublicViewUrl(invoiceNumber);

  function printInvoice() {
    window.print();
  }

  function shareWhatsApp() {
    const digits = customerPhone.replace(/\D/g, '');
    const body = `Hi ${customerName}, your invoice ${invoiceNumber} for ${grandTotalLabel} is ready: ${publicUrl}`;
    const url =
      digits.length >= 10
        ? buildWhatsAppUrl(digits, body)
        : `https://wa.me/?text=${encodeURIComponent(body)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <>
      <a href={pdfUrl} className="fyh-invoice-btn">
        Download PDF
      </a>
      <button type="button" onClick={printInvoice} className="fyh-invoice-btn">
        Print
      </button>
      <button type="button" onClick={shareWhatsApp} className="fyh-invoice-btn">
        Share
      </button>
    </>
  );
}
