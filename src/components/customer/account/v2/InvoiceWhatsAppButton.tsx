'use client';

import {
  buildInvoiceWhatsAppMessage,
  buildInvoiceWhatsAppUrl,
} from '@/src/lib/billing/invoiceWhatsApp';

type Props = {
  customerName: string;
  customerPhone: string;
  invoiceNumber: string;
  amountPaise: number;
  paymentLinkUrl?: string | null;
  breakdownLines?: { label: string; amountPaise: number }[];
};

export function InvoiceWhatsAppButton({
  customerName,
  customerPhone,
  invoiceNumber,
  amountPaise,
  paymentLinkUrl,
  breakdownLines = [],
}: Props) {
  const breakdown =
    breakdownLines.length > 0
      ? {
          lines: breakdownLines.map((l) => ({
            kind: 'line',
            label: l.label,
            amountPaise: l.amountPaise,
          })),
        }
      : null;

  const url = buildInvoiceWhatsAppUrl({
    customerName,
    customerPhone,
    invoiceNumber,
    amountPaise,
    paymentLinkUrl: paymentLinkUrl ?? undefined,
    breakdown,
  });

  if (!url) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex min-h-[40px] cursor-not-allowed items-center rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-400"
      >
        Send Invoice on WhatsApp
      </button>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
      title={buildInvoiceWhatsAppMessage({
        customerName,
        invoiceNumber,
        amountPaise,
        paymentLinkUrl: paymentLinkUrl ?? undefined,
        breakdown,
      })}
    >
      <span aria-hidden>📲</span>
      Send Invoice on WhatsApp
    </a>
  );
}
