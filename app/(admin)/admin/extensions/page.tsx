import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconLayers } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { listStayExtensions } from '@/src/db/queries/admin';
import { formatDate, formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS: Array<{
  label: string;
  value: '' | 'pending' | 'paid' | 'cancelled';
}> = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Paid', value: 'paid' },
  { label: 'Cancelled', value: 'cancelled' },
];

export default async function AdminExtensionsPage(
  props: PageProps<'/admin/extensions'>,
) {
  const sp = await props.searchParams;
  const rawStatus = typeof sp.status === 'string' ? sp.status : '';
  const status = STATUS_FILTERS.some((f) => f.value === rawStatus)
    ? (rawStatus as '' | 'pending' | 'paid' | 'cancelled')
    : '';
  const res = await listStayExtensions(
    status ? { status: status as 'pending' | 'paid' | 'cancelled' } : undefined,
  );

  return (
    <>
      <PageHeader
        title="Stay extensions"
        description="Every extension on every confirmed booking, newest first. Pending extensions hold beds until paid; cancelled extensions release them back to availability."
      />

      <nav className="mb-4 flex flex-wrap gap-2 text-xs">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.value || 'all'}
            href={f.value ? `/admin/extensions?status=${f.value}` : '/admin/extensions'}
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

      {!res.ok ? (
        <DbStatusBanner error={res.error} />
      ) : res.data.length === 0 ? (
        <EmptyState
          icon={<IconLayers />}
          title="No extensions found"
          description={
            status
              ? `No extensions in status "${status}". Try the All tab.`
              : 'Extensions appear here as soon as a customer or admin requests one against a confirmed booking.'
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Created</TH>
              <TH>Booking</TH>
              <TH>Customer</TH>
              <TH>Until</TH>
              <TH>Mode</TH>
              <TH>Beds</TH>
              <TH>By</TH>
              <TH>Status</TH>
              <TH className="text-right">Amount</TH>
              <TH>Updated</TH>
            </TR>
          </THead>
          <TBody>
            {res.data.map((e) => (
              <TR key={e.id}>
                <TD className="text-xs text-zinc-600">{formatDateTime(e.createdAt)}</TD>
                <TD>
                  <Link
                    href={`/admin/bookings/${e.bookingId}`}
                    className="font-mono text-indigo-600 hover:underline"
                  >
                    {e.bookingCode}
                  </Link>
                </TD>
                <TD>
                  <div className="text-sm text-zinc-900">{e.customerFullName}</div>
                  <div className="text-[11px] font-mono text-zinc-500">
                    {e.customerPhone}
                  </div>
                </TD>
                <TD className="text-xs">{formatDate(e.requestedUntilDate)}</TD>
                <TD>{titleCase(e.extensionDurationMode)}</TD>
                <TD>{e.bedCount}</TD>
                <TD className="text-xs text-zinc-600">{titleCase(e.requestedBy)}</TD>
                <TD>
                  <Badge tone={toneForStatus(e.status)}>{titleCase(e.status)}</Badge>
                </TD>
                <TD className="text-right tabular-nums">
                  {paiseToInr(e.quotedTotalPaise)}
                </TD>
                <TD className="text-xs text-zinc-500">{formatDateTime(e.updatedAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
