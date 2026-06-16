import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import {
  getInvoiceStats,
  listUnifiedInvoices,
  type InvoiceListFilters,
} from '@/src/services/unifiedInvoices';
import type { FinancialInvoiceStatus } from '@/src/db/schema/enums';

export const dynamic = 'force-dynamic';

const STATUS_TABS: Array<{ id: InvoiceListFilters['status']; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'paid', label: 'Paid' },
  { id: 'partial', label: 'Partial' },
  { id: 'pending', label: 'Pending' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'refunded', label: 'Refunded' },
];

function tabHref(status: InvoiceListFilters['status'], search?: string) {
  const params = new URLSearchParams();
  if (status && status !== 'all') params.set('status', status);
  if (search?.trim()) params.set('q', search.trim());
  const qs = params.toString();
  return qs ? `/admin/invoices?${qs}` : '/admin/invoices';
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const status = STATUS_TABS.some((t) => t.id === sp.status)
    ? (sp.status as InvoiceListFilters['status'])
    : 'all';
  const search = sp.q?.trim() ?? '';

  const [invoices, stats] = await Promise.all([
    listUnifiedInvoices({ status, search: search || undefined, limit: 300 }),
    getInvoiceStats(),
  ]);

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.invoices.label },
        ]}
      />
      <PageHeader
        title="Invoices"
        description="Single source of truth for billing and collections. Revenue = paid − cancelled − refunded."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Net revenue', paiseToInr(stats.netRevenuePaise)],
          ['Paid', stats.paidCount],
          ['Pending', stats.pendingCount],
          ['Overdue', stats.overdueCount],
          ['Cancelled / Refunded', `${stats.cancelledCount} / ${stats.refundedCount}`],
        ].map(([label, val]) => (
          <div key={String(label)} className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
            <p className="text-[10px] uppercase text-apg-silver">{label}</p>
            <p className="mt-2 text-xl font-semibold text-white">{val}</p>
          </div>
        ))}
      </div>

      <form method="get" className="mb-4 flex flex-wrap gap-2">
        {status !== 'all' ? <input type="hidden" name="status" value={status} /> : null}
        <input
          name="q"
          defaultValue={search}
          placeholder="Search resident, phone, invoice #, PG…"
          className="min-w-[240px] flex-1 rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
        />
        <button
          type="submit"
          className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          Search
        </button>
      </form>

      <div className="mb-6 flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id, search)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              status === t.id
                ? 'bg-[#FF5A1F] text-white'
                : 'border border-white/10 text-apg-silver hover:text-white'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Invoice #</TH>
            <TH>Resident</TH>
            <TH>PG</TH>
            <TH>Room</TH>
            <TH>Bed</TH>
            <TH>Type</TH>
            <TH className="text-right">Amount</TH>
            <TH>Status</TH>
            <TH>Created</TH>
            <TH>Due</TH>
            <TH>Paid</TH>
          </TR>
        </THead>
        <TBody>
          {invoices.length === 0 ? (
            <TR>
              <TD colSpan={11} className="py-8 text-center text-apg-silver">
                No invoices match this filter.
              </TD>
            </TR>
          ) : (
            invoices.map((inv) => (
              <TR key={inv.id}>
                <TD>
                  <Link
                    href={`/admin/invoices/${inv.id}`}
                    className="font-medium text-[#FF5A1F] hover:underline"
                  >
                    {inv.invoiceNumber}
                  </Link>
                </TD>
                <TD>
                  <div>{inv.customerName}</div>
                  <div className="text-xs text-apg-silver">{inv.customerPhone}</div>
                </TD>
                <TD>{inv.pgName}</TD>
                <TD>{inv.roomNumber ?? '—'}</TD>
                <TD>{inv.bedCode ?? '—'}</TD>
                <TD>{titleCase(inv.invoiceType.replace('_', ' '))}</TD>
                <TD className="text-right">{paiseToInr(inv.amountPaise)}</TD>
                <TD>
                  <Badge tone={toneForStatus(inv.status as FinancialInvoiceStatus)}>
                    {titleCase(inv.status)}
                  </Badge>
                </TD>
                <TD>{formatDate(inv.createdAt)}</TD>
                <TD>{inv.dueDate ? formatDate(inv.dueDate) : '—'}</TD>
                <TD>{inv.paidAt ? formatDate(inv.paidAt) : '—'}</TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </>
  );
}
