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
};

/** One invoice — big text, no jargon. */
export function SimpleInvoiceCard({
  invoice,
  customerName,
  customerPhone,
  stayDaysLabel,
}: Props) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      {stayDaysLabel ? (
        <p className="text-lg font-bold text-zinc-900">You stayed for {stayDaysLabel}</p>
      ) : (
        <p className="text-lg font-bold text-zinc-900">{invoice.label}</p>
      )}

      <dl className="mt-4 space-y-3 text-base">
        {invoice.rentPaise > 0 ? (
          <div className="flex justify-between">
            <dt className="text-zinc-600">Rent</dt>
            <dd className="font-semibold text-zinc-900">{paiseToInr(invoice.rentPaise)}</dd>
          </div>
        ) : null}
        {invoice.electricityPaise > 0 ? (
          <div className="flex justify-between">
            <dt className="text-zinc-600">Electricity</dt>
            <dd className="font-semibold text-zinc-900">{paiseToInr(invoice.electricityPaise)}</dd>
          </div>
        ) : null}
        {invoice.depositPaidPaise > 0 ? (
          <div className="flex justify-between">
            <dt className="text-zinc-600">Deposit</dt>
            <dd className="font-semibold text-zinc-900">{paiseToInr(invoice.depositPaidPaise)}</dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-4 text-sm text-zinc-500">
        Final amount:{' '}
        <span className="text-xl font-bold text-zinc-900">{paiseToInr(invoice.finalAmountPaise)}</span>
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
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
