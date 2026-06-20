'use client';

import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { InvoiceWhatsAppButton } from '@/src/components/customer/account/v2/InvoiceWhatsAppButton';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import type { ResidentInvoiceCard } from '@/src/services/residentAccountContext';

type Props = {
  invoices: ResidentInvoiceCard[];
  customerName: string;
  customerPhone: string;
};

export function InvoiceListModule({ invoices, customerName, customerPhone }: Props) {
  if (invoices.length === 0) {
    return (
      <section id="invoices" className="scroll-mt-24">
        <ApgCard tier="account" className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-zinc-900">Invoices</h2>
          <p className="mt-2 text-sm text-zinc-600">No invoices yet. They appear here after booking.</p>
        </ApgCard>
      </section>
    );
  }

  return (
    <section id="invoices" className="scroll-mt-24">
      <ApgCard tier="account" className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-900">Invoices</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Full breakdown before payment. Share any invoice on WhatsApp.
        </p>

        <ul className="mt-5 space-y-4">
          {invoices.map((inv) => (
            <li
              key={inv.id}
              className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Invoice #{inv.invoiceNumber}</p>
                  <p className="text-xs text-zinc-500">{inv.label}</p>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-zinc-200 text-zinc-700">
                  {titleCase(inv.status)}
                </span>
              </div>

              {inv.stayDurationLabel ? (
                <p className="mt-3 text-xs text-zinc-600">
                  Stay duration: <strong>{inv.stayDurationLabel}</strong>
                </p>
              ) : null}
              {inv.checkInLabel ? (
                <p className="mt-1 text-xs text-zinc-600">Check-in: {inv.checkInLabel}</p>
              ) : null}
              {inv.checkOutLabel ? (
                <p className="mt-1 text-xs text-zinc-600">Check-out: {inv.checkOutLabel}</p>
              ) : null}

              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {inv.rentPaise > 0 ? (
                  <div>
                    <dt className="text-zinc-500">Rent</dt>
                    <dd className="font-semibold text-zinc-900">{paiseToInr(inv.rentPaise)}</dd>
                  </div>
                ) : null}
                {inv.electricityPaise > 0 ? (
                  <div>
                    <dt className="text-zinc-500">Electricity</dt>
                    <dd className="font-semibold text-zinc-900">{paiseToInr(inv.electricityPaise)}</dd>
                  </div>
                ) : null}
                {inv.depositPaidPaise > 0 ? (
                  <div>
                    <dt className="text-zinc-500">Deposit paid</dt>
                    <dd className="font-semibold text-zinc-900">{paiseToInr(inv.depositPaidPaise)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-zinc-500">Final amount</dt>
                  <dd className="font-bold text-zinc-900">{paiseToInr(inv.finalAmountPaise)}</dd>
                </div>
              </dl>

              {inv.dueDate ? (
                <p className="mt-2 text-[11px] text-zinc-500">Due {formatDate(inv.dueDate)}</p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {inv.payHref ? (
                  <Link
                    href={inv.payHref}
                    className="inline-flex min-h-[40px] items-center rounded-lg bg-apg-orange px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
                  >
                    Pay {paiseToInr(inv.finalAmountPaise)}
                  </Link>
                ) : null}
                <InvoiceWhatsAppButton
                  customerName={customerName}
                  customerPhone={customerPhone}
                  invoiceNumber={inv.invoiceNumber}
                  amountPaise={inv.finalAmountPaise}
                  paymentLinkUrl={inv.paymentLinkUrl}
                  breakdownLines={[
                    ...(inv.rentPaise > 0 ? [{ label: 'Rent', amountPaise: inv.rentPaise }] : []),
                    ...(inv.electricityPaise > 0
                      ? [{ label: 'Electricity', amountPaise: inv.electricityPaise }]
                      : []),
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      </ApgCard>
    </section>
  );
}
