import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconClipboard } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { getRentStats, listAdminRentInvoices } from '@/src/db/queries/admin';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { GenerateInvoicesButton, MarkOverdueButton } from '@/src/components/admin/RentBillingActions';
import { defaultBillingMonth } from '@/src/lib/dateDefaults';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS: Array<{
  label: string;
  value: '' | 'pending' | 'paid' | 'overdue' | 'cancelled';
}> = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Paid', value: 'paid' },
  { label: 'Cancelled', value: 'cancelled' },
];

export default async function AdminRentPage(props: PageProps<'/admin/rent'>) {
  const sp = await props.searchParams;
  const rawStatus = typeof sp.status === 'string' ? sp.status : '';
  const status = STATUS_FILTERS.some((f) => f.value === rawStatus)
    ? (rawStatus as '' | 'pending' | 'paid' | 'overdue' | 'cancelled')
    : '';

  const [stats, invoices] = await Promise.all([
    getRentStats(),
    listAdminRentInvoices(
      status
        ? { status: status as 'pending' | 'paid' | 'overdue' | 'cancelled' }
        : undefined,
    ),
  ]);

  const thisMonth = defaultBillingMonth();

  return (
    <>
      <PageHeader
        title="Rent management"
        description="Monthly rent invoices for every active monthly resident. Invoices are generated on the 1st of each month (or via the button below). Late fees accrue at 1%/day after the 5-day grace period."
      />

      {stats.ok ? (
        <section className="mb-4 grid gap-3 sm:grid-cols-4">
          <StatCard label="Pending" value={stats.data.pendingCount.toLocaleString()} />
          <StatCard label="Overdue" value={stats.data.overdueCount.toLocaleString()} accent />
          <StatCard label="Paid" value={stats.data.paidCount.toLocaleString()} />
          <StatCard
            label="Outstanding"
            value={paiseToInr(stats.data.outstandingPaise)}
          />
        </section>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav className="flex flex-wrap gap-2 text-xs">
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.value || 'all'}
              href={f.value ? `/admin/rent?status=${f.value}` : '/admin/rent'}
              className={
                'rounded-full px-3 py-1 ring-1 ring-inset transition-colors ' +
                (f.value === status
                  ? 'bg-indigo-600 text-white ring-indigo-600'
                  : 'bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50')
              }
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex gap-2">
          <GenerateInvoicesButton billingMonth={thisMonth} />
          <MarkOverdueButton />
        </div>
      </div>

      {!invoices.ok ? (
        <DbStatusBanner error={invoices.error} />
      ) : invoices.data.length === 0 ? (
        <EmptyState
          icon={<IconClipboard />}
          title="No rent invoices yet"
          description="Run 'Generate invoices for this month' to fan-out monthly invoices for every active monthly resident."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Invoice</TH>
              <TH>Month</TH>
              <TH>Due</TH>
              <TH>Booking</TH>
              <TH>Resident</TH>
              <TH>Bed</TH>
              <TH className="text-right">Rent</TH>
              <TH className="text-right">Late fee</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {invoices.data.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xs">
                  <Link
                    href={`/admin/bookings/${r.bookingId}`}
                    className="text-indigo-600 hover:underline"
                  >
                    {r.invoiceNumber}
                  </Link>
                </TD>
                <TD className="text-xs">{formatDate(r.billingMonth)}</TD>
                <TD className="text-xs">{formatDate(r.dueDate)}</TD>
                <TD className="font-mono text-xs">{r.bookingCode}</TD>
                <TD>
                  <div className="text-sm text-zinc-900">{r.customerFullName}</div>
                  <div className="font-mono text-[11px] text-zinc-500">
                    {r.customerPhone}
                  </div>
                </TD>
                <TD className="text-xs">
                  {r.pgName} · {r.roomNumber}/{r.bedCode}
                </TD>
                <TD className="text-right tabular-nums">
                  {paiseToInr(r.rentPaise)}
                </TD>
                <TD className="text-right tabular-nums">
                  {paiseToInr(r.paidLateFeePaise + (r.lateFeeLockedPaise ?? 0))}
                </TD>
                <TD>
                  <Badge tone={toneForStatus(r.status)}>{titleCase(r.status)}</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        'rounded-lg border p-3 ' +
        (accent ? 'border-rose-200 bg-rose-50' : 'border-zinc-200 bg-white')
      }
    >
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-zinc-900">{value}</div>
    </div>
  );
}
