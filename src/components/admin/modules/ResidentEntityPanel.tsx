'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { AdminBillingWhatsAppButton } from '@/src/components/admin/AdminBillingWhatsAppButton';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import type {
  AdminElectricityInvoiceReminderRow,
  AdminRentInvoiceRow,
} from '@/src/db/queries/admin';
import { invoiceHrefFromMap } from '@/src/lib/billing/invoiceHrefMap';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';

type DepositRow = {
  bookingId: string;
  collectedPaise: number;
  refundableBalancePaise: number;
};

export function ResidentEntityPanel({
  residentName,
  phone,
  pgName,
  rentInvoices,
  electricityInvoices,
  deposits,
  module,
  pgId,
  invoiceHrefMap = {},
}: {
  residentName: string;
  phone: string;
  pgName: string;
  rentInvoices: AdminRentInvoiceRow[];
  electricityInvoices: AdminElectricityInvoiceReminderRow[];
  deposits: DepositRow[];
  module: 'revenue' | 'collections' | 'operations';
  pgId: string;
  invoiceHrefMap?: Record<string, string>;
}) {
  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
        <h2 className="text-lg font-semibold text-white">{residentName}</h2>
        <p className="text-sm text-apg-silver">
          {pgName} · {phone}
        </p>
        <p className="mt-2 text-xs text-apg-silver">
          Level 3 — entity view. Use action buttons below; drawer opens without leaving this page.
        </p>
        <Link
          href={`/admin/residents?search=${encodeURIComponent(phone)}`}
          className="mt-3 inline-block text-xs text-[#FF5A1F] hover:underline"
        >
          Full resident profile →
        </Link>
      </section>

      <InvoiceSection title="Rent invoices" empty="No rent invoices." rows={rentInvoices.map((r) => ({
        key: r.id,
        meta: r.invoiceNumber,
        invoiceHref: invoiceHrefFromMap(invoiceHrefMap, 'rent_invoices', r.id),
        amount: r.rentPaise,
        status: r.status,
        date: formatDate(r.dueDate),
        action:
          r.status === 'pending' || r.status === 'overdue' ? (
            <AdminBillingWhatsAppButton
              kind="rent"
              customerName={r.customerFullName}
              phone={r.customerPhone}
              pgName={r.pgName}
              roomNumber={r.roomNumber}
              amountPaise={r.rentPaise}
              dueDate={r.dueDate}
              billingMonth={r.billingMonth}
              isOverdue={r.status === 'overdue'}
            />
          ) : null,
      }))} />

      <InvoiceSection
        title="Electricity"
        empty="No electricity invoices."
        rows={electricityInvoices.map((r) => ({
          key: r.id,
          meta: r.invoiceNumber,
          invoiceHref: invoiceHrefFromMap(invoiceHrefMap, 'electricity_invoices', r.id),
          amount: r.amountPaise,
          status: r.isOverdue ? 'overdue' : 'pending',
          date: formatDate(r.dueDate),
          action: (
            <AdminBillingWhatsAppButton
              kind="electricity"
              customerName={r.customerFullName}
              phone={r.customerPhone}
              pgName={r.pgName}
              roomNumber={r.roomNumber}
              amountPaise={r.amountPaise}
              dueDate={r.dueDate}
              billingMonth={r.billingMonth}
              isOverdue={r.isOverdue}
            />
          ),
        }))}
      />

      {deposits.length > 0 ? (
        <InvoiceSection
          title="Deposits"
          empty=""
          rows={deposits.map((d) => ({
            key: d.bookingId,
            meta: 'Deposit ledger',
            amount: d.collectedPaise,
            status: d.refundableBalancePaise > 0 ? 'held' : 'settled',
            date: '—',
            action: (
              <Link
                href={`/admin/deposits/${d.bookingId}`}
                className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-apg-silver hover:text-white"
              >
                Ledger
              </Link>
            ),
          }))}
        />
      ) : null}
    </div>
  );
}

function InvoiceSection({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{
    key: string;
    meta: string;
    invoiceHref?: string;
    amount: number;
    status: string;
    date: string;
    action: ReactNode;
  }>;
}) {
  if (rows.length === 0) {
    return empty ? (
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="text-sm text-apg-silver">{empty}</p>
      </section>
    ) : null;
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <div className="overflow-hidden rounded-xl border border-white/10">
        <Table>
          <THead>
            <TR>
              <TH>Reference</TH>
              <TH>Due</TH>
              <TH className="text-right">Amount</TH>
              <TH>Status</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.key}>
                <TD className="text-sm text-white">
                  {r.invoiceHref ? (
                    <Link href={r.invoiceHref} className="font-medium text-[#FF5A1F] hover:underline">
                      {r.meta}
                    </Link>
                  ) : (
                    r.meta
                  )}
                </TD>
                <TD className="text-xs text-apg-silver">{r.date}</TD>
                <TD className="text-right tabular-nums">{paiseToInr(r.amount)}</TD>
                <TD>
                  <Badge tone={toneForStatus(r.status)}>{titleCase(r.status)}</Badge>
                </TD>
                <TD>{r.action}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </section>
  );
}
