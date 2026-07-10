'use client';

import Link from 'next/link';
import { InvoiceWhatsAppButton } from '@/src/components/customer/account/v2/InvoiceWhatsAppButton';
import { paiseToInr } from '@/src/lib/format';
import type { ResidentInvoiceCard } from '@/src/services/residentAccountContext';

type Props = {
  invoice: ResidentInvoiceCard;
  customerName: string;
  customerPhone: string;
  stayDaysLabel?: string | null;
  variant?: 'light' | 'dark';
};

/** One invoice — big text, no jargon. */
export function SimpleInvoiceCard({
  invoice,
  customerName,
  customerPhone,
  stayDaysLabel,
  variant = 'light',
}: Props) {
  const dark = variant === 'dark';
  const shell = dark
    ? 'rounded-2xl border border-white/10 apg-glass-light p-5'
    : 'rounded-2xl border border-zinc-200 bg-white p-5';
  const title = dark ? 'text-white' : 'text-zinc-900';
  const muted = dark ? 'text-apg-silver' : 'text-zinc-600';
  const value = dark ? 'text-white' : 'text-zinc-900';

  return (
    <div className={shell}>
      {stayDaysLabel ? (
        <p className={`text-lg font-bold ${title}`}>You stayed for {stayDaysLabel}</p>
      ) : (
        <p className={`text-lg font-bold ${title}`}>{invoice.label}</p>
      )}

      <dl className={`mt-4 space-y-3 text-base`}>
        {invoice.rentPaise > 0 ? (
          <div className="flex justify-between">
            <dt className={muted}>Rent</dt>
            <dd className={`font-semibold ${value}`}>{paiseToInr(invoice.rentPaise)}</dd>
          </div>
        ) : null}
        {invoice.electricityPaise > 0 ? (
          <div className="flex justify-between">
            <dt className={muted}>Electricity</dt>
            <dd className={`font-semibold ${value}`}>{paiseToInr(invoice.electricityPaise)}</dd>
          </div>
        ) : null}
        {invoice.depositPaidPaise > 0 ? (
          <div className="flex justify-between">
            <dt className={muted}>Deposit</dt>
            <dd className={`font-semibold ${value}`}>{paiseToInr(invoice.depositPaidPaise)}</dd>
          </div>
        ) : null}
      </dl>

      <p className={`mt-4 text-sm ${dark ? 'text-apg-muted' : 'text-zinc-500'}`}>
        Final amount:{' '}
        <span className={`text-xl font-bold ${value}`}>{paiseToInr(invoice.finalAmountPaise)}</span>
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {invoice.detailHref ? (
          <Link
            href={invoice.detailHref}
            className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border px-4 text-sm font-semibold ${
              dark
                ? 'border-white/20 text-white hover:bg-white/10'
                : 'border-zinc-300 text-zinc-900 hover:bg-zinc-50'
            }`}
          >
            View invoice
          </Link>
        ) : null}
        {invoice.payHref ? (
          <Link
            href={invoice.payHref}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-apg-orange px-4 text-sm font-bold text-white"
          >
            Pay now
          </Link>
        ) : null}
        <InvoiceWhatsAppButton
          customerName={customerName}
          customerPhone={customerPhone}
          invoiceNumber={invoice.invoiceNumber}
          amountPaise={invoice.finalAmountPaise}
          paymentLinkUrl={invoice.paymentLinkUrl}
          breakdownLines={[
            ...(invoice.rentPaise > 0 ? [{ label: 'Rent', amountPaise: invoice.rentPaise }] : []),
            ...(invoice.electricityPaise > 0
              ? [{ label: 'Electricity', amountPaise: invoice.electricityPaise }]
              : []),
          ]}
        />
      </div>
    </div>
  );
}
