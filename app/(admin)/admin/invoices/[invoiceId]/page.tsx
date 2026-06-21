import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { InvoiceDetailActions } from '@/src/components/admin/InvoiceDetailActions';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { paymentLinkPublicUrl } from '@/src/lib/billing/paymentLinkUrl';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { getUnifiedInvoiceDetail } from '@/src/services/unifiedInvoices';
import { getInvoiceVoidCapabilities } from '@/src/services/invoiceVoid';
import type { FinancialInvoiceStatus } from '@/src/db/schema/enums';

export const dynamic = 'force-dynamic';

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const detail = await getUnifiedInvoiceDetail(invoiceId);
  if (!detail) notFound();
  const voidCaps = await getInvoiceVoidCapabilities(invoiceId);

  const breakdown = detail.breakdown ?? {};
  const paymentUrl = detail.paymentLink ? paymentLinkPublicUrl(detail.paymentLink.id) : null;

  const timeline = [
    { label: 'Created', at: detail.createdAt, done: true },
    { label: 'Sent', at: detail.sentAt, done: Boolean(detail.sentAt) },
    { label: 'Paid', at: detail.paidAt, done: detail.status === 'paid' || Boolean(detail.paidAt) },
    {
      label: 'Cancelled',
      at: detail.cancelledAt,
      done: detail.status === 'cancelled',
    },
    {
      label: 'Refunded',
      at: detail.refundedAt,
      done: detail.status === 'refunded',
    },
  ];

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.invoices.label, href: ADMIN_MODULES.invoices.href },
          { label: detail.invoiceNumber },
        ]}
      />
      <PageHeader
        title={`Invoice ${detail.invoiceNumber}`}
        description={`${titleCase(detail.invoiceType)} · ${detail.pgName}`}
        actions={
          <Link
            href="/admin/invoices"
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-apg-silver hover:text-white"
          >
            ← All invoices
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
          <h2 className="text-sm font-semibold text-white">Resident & stay</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Invoice ID" value={detail.id} mono />
            <Row label="Resident" value={detail.customerName} />
            <Row label="Phone" value={detail.customerPhone} />
            <Row label="PG" value={detail.pgName} />
            <Row label="Room" value={detail.roomNumber ?? '—'} />
            <Row label="Bed" value={detail.bedCode ?? '—'} />
            <Row label="Status">
              <Badge tone={toneForStatus(detail.status as FinancialInvoiceStatus)}>
                {titleCase(detail.status)}
              </Badge>
            </Row>
          </dl>
        </section>

        <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
          <h2 className="text-sm font-semibold text-white">Breakdown</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Rent" value={paiseToInr(breakdown.rentPaise ?? 0)} />
            <Row label="Electricity" value={paiseToInr(breakdown.electricityPaise ?? 0)} />
            <Row label="Deposit" value={paiseToInr(breakdown.depositPaise ?? 0)} />
            <Row label="PS4" value={paiseToInr(breakdown.ps4Paise ?? 0)} />
            <Row label="Other charges" value={paiseToInr(breakdown.otherPaise ?? 0)} />
            {breakdown.lateFeePaise ? (
              <Row label="Late fee" value={paiseToInr(breakdown.lateFeePaise)} />
            ) : null}
            <Row label="Total" value={paiseToInr(detail.amountPaise)} strong />
          </dl>
          {detail.dueDate ? (
            <p className="mt-4 text-xs text-apg-silver">Due {formatDate(detail.dueDate)}</p>
          ) : null}
        </section>
      </div>

      <section className="mb-6 rounded-xl border border-white/10 bg-[#1A1F27] p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">Actions</h2>
        <InvoiceDetailActions
          invoiceId={detail.id}
          status={detail.status}
          existingPaymentUrl={paymentUrl}
          canVoidExpressSale={voidCaps.canVoidExpressSale}
          bookingCode={voidCaps.bookingCode}
        />
      </section>

      <section className="mb-6 rounded-xl border border-white/10 bg-[#1A1F27] p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">Timeline</h2>
        <ol className="space-y-3">
          {timeline.map((step) => (
            <li key={step.label} className="flex items-center gap-3 text-sm">
              <span
                className={`h-2.5 w-2.5 rounded-full ${step.done ? 'bg-emerald-400' : 'bg-white/20'}`}
              />
              <span className={step.done ? 'text-white' : 'text-apg-silver'}>{step.label}</span>
              <span className="ml-auto text-xs text-apg-silver">
                {step.at ? formatDate(step.at) : '—'}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">Audit log</h2>
        {detail.auditEvents.length === 0 ? (
          <p className="text-sm text-apg-silver">No audit events yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Action</TH>
                <TH>Actor</TH>
                <TH>When</TH>
                <TH>Details</TH>
              </TR>
            </THead>
            <TBody>
              {detail.auditEvents.map((ev) => (
                <TR key={ev.id}>
                  <TD>{titleCase(ev.action.replace(/_/g, ' '))}</TD>
                  <TD>
                    {ev.actorType}
                    {ev.actorId ? ` · ${ev.actorId.slice(0, 8)}…` : ''}
                  </TD>
                  <TD>{formatDate(ev.createdAt)}</TD>
                  <TD className="max-w-md truncate text-xs text-apg-silver">
                    {ev.diff ? JSON.stringify(ev.diff) : '—'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </>
  );
}

function Row({
  label,
  value,
  mono,
  strong,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  strong?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-apg-silver">{label}</dt>
      <dd className={`text-right ${mono ? 'font-mono text-xs' : ''} ${strong ? 'font-semibold text-white' : 'text-white'}`}>
        {children ?? value}
      </dd>
    </div>
  );
}
