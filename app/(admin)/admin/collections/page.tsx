import Link from 'next/link';
import { AdminPendingPaymentsPanel } from '@/src/components/admin/AdminPendingPaymentsPanel';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { FinancialRowActions } from '@/src/components/admin/FinancialRowActions';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import {
  getRentStats,
  listAdminElectricityInvoicesForReminders,
  listAdminRentInvoices,
  listPgs,
} from '@/src/db/queries/admin';
import { requireAdminPermission, requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref, modulePgHref } from '@/src/lib/admin/navigation';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';

export const dynamic = 'force-dynamic';

const TABS = [
  { id: 'approvals', label: 'Approval queue' },
  { id: 'rent', label: 'Rent invoices' },
  { id: 'electricity', label: 'Electricity' },
  { id: 'paid', label: 'Paid history' },
] as const;

export default async function CollectionsModulePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = TABS.some((t) => t.id === sp.tab) ? sp.tab! : 'approvals';

  const session = await requireAdminSession('/admin/collections');
  const [pending, rentStats, rentPending, rentPaid, elecPending, pgs] = await Promise.all([
    requireAdminPermission('payments:write').then((s) => listPendingPaymentReviews(s)),
    getRentStats(),
    listAdminRentInvoices({ status: 'pending' }),
    listAdminRentInvoices({ status: 'paid' }),
    listAdminElectricityInvoicesForReminders(),
    listPgs(),
  ]);

  const pgNameById = new Map(pgs.ok ? pgs.data.map((p) => [p.id, p.name]) : []);

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.collections.label },
        ]}
      />
      <PageHeader
        title="Collections"
        description="Pending payments, invoice status, QR approvals, and paid history. Active collections are driven by the unified invoice registry."
      />
      <p className="mb-4 text-sm text-apg-silver">
        <Link href="/admin/invoices" className="font-semibold text-[#FF5A1F] hover:underline">
          Open Invoices →
        </Link>{' '}
        — single source of truth (paid − cancelled − refunded). Cancelled and refunded invoices are excluded from revenue.
      </p>

      {rentStats.ok ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['Pending rent', rentStats.data.pendingCount],
            ['Overdue', rentStats.data.overdueCount],
            ['Paid', rentStats.data.paidCount],
            ['Outstanding', paiseToInr(rentStats.data.outstandingPaise)],
          ].map(([label, val]) => (
            <div key={String(label)} className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
              <p className="text-[10px] uppercase text-apg-silver">{label}</p>
              <p className="mt-2 text-xl font-semibold text-white">{val}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin/collections?tab=${t.id}`}
            className={
              'rounded-full px-3 py-1.5 text-xs font-medium transition ' +
              (tab === t.id
                ? 'bg-[#FF5A1F] text-white'
                : 'border border-white/10 text-apg-silver hover:text-white')
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'approvals' ? (
        <AdminSectionErrorBoundary title="Approval queue">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-white">
              Awaiting approval ({pending.length})
            </h2>
            <AdminPendingPaymentsPanel items={pending} />
          </section>
        </AdminSectionErrorBoundary>
      ) : null}

      {tab === 'rent' ? (
        <InvoiceTable
          title="Pending rent invoices"
          error={rentPending.ok ? null : rentPending.error}
          rows={rentPending.ok ? rentPending.data : []}
          pgNameById={pgNameById}
        />
      ) : null}

      {tab === 'electricity' ? (
        <InvoiceTable
          title="Pending electricity invoices"
          error={elecPending.ok ? null : elecPending.error}
          rows={elecPending.ok ? elecPending.data : []}
          pgNameById={pgNameById}
          electricity
        />
      ) : null}

      {tab === 'paid' ? (
        <InvoiceTable
          title="Recently paid rent"
          error={rentPaid.ok ? null : rentPaid.error}
          rows={rentPaid.ok ? rentPaid.data.slice(0, 50) : []}
          pgNameById={pgNameById}
        />
      ) : null}
    </>
  );
}

function InvoiceTable({
  title,
  error,
  rows,
  pgNameById,
  electricity,
}: {
  title: string;
  error: string | null;
  rows: Array<{
    id: string;
    customerId?: string;
    customerFullName: string;
    customerPhone: string;
    pgName: string;
    pgId?: string;
    roomNumber: string;
    amountPaise?: number;
    rentPaise?: number;
    status?: string;
    dueDate: string;
    bookingId?: string;
    isOverdue?: boolean;
  }>;
  pgNameById: Map<string, string>;
  electricity?: boolean;
}) {
  if (error) return <DbStatusBanner error={error} />;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <div className="overflow-hidden rounded-xl border border-white/10">
        <Table>
          <THead>
            <TR>
              <TH>Resident</TH>
              <TH>PG · room</TH>
              <TH className="text-right">Amount</TH>
              <TH>Due</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => {
              const amount = electricity ? (r.amountPaise ?? 0) : (r.rentPaise ?? 0);
              const pgId =
                r.pgId ?? [...pgNameById.entries()].find(([, n]) => n === r.pgName)?.[0] ?? '';
              const showActions =
                r.customerId && pgId && amount > 0 && r.status !== 'paid' && r.status !== 'cancelled';
              return (
                <TR key={r.id}>
                  <TD>
                    {r.customerId ? (
                      <Link
                        href={`/admin/residents/${r.customerId}`}
                        className="font-medium text-white hover:text-[#FF5A1F]"
                      >
                        {r.customerFullName}
                      </Link>
                    ) : pgId ? (
                      <Link
                        href={modulePgHref('collections', pgId)}
                        className="font-medium text-white hover:text-[#FF5A1F]"
                      >
                        {r.customerFullName}
                      </Link>
                    ) : (
                      r.customerFullName
                    )}
                    <p className="font-mono text-[11px] text-zinc-500">{r.customerPhone}</p>
                  </TD>
                  <TD className="text-xs text-apg-silver">
                    {r.pgName} · R{r.roomNumber}
                  </TD>
                  <TD className="text-right tabular-nums">{paiseToInr(amount)}</TD>
                  <TD className="text-xs">{formatDate(r.dueDate)}</TD>
                  <TD>
                    {r.status ? (
                      <Badge tone={toneForStatus(r.status)}>{titleCase(r.status)}</Badge>
                    ) : (
                      <Badge tone="amber">pending</Badge>
                    )}
                  </TD>
                  <TD className="text-right">
                    {showActions ? (
                      <FinancialRowActions
                        residentId={r.customerId!}
                        residentName={r.customerFullName}
                        phone={r.customerPhone}
                        pgId={pgId}
                        pgName={r.pgName}
                        amountPaise={amount}
                        purpose={electricity ? 'electricity' : 'rent'}
                        dueDate={r.dueDate}
                        roomNumber={r.roomNumber}
                        isOverdue={r.isOverdue ?? r.status === 'overdue'}
                        bookingId={r.bookingId}
                      />
                    ) : (
                      <span className="text-[10px] text-apg-silver">—</span>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
    </section>
  );
}
