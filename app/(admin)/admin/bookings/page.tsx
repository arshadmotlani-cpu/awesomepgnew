import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconClipboard } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { listBookings } from '@/src/db/queries/admin';
import { formatDate, formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function BookingsPage() {
  const res = await listBookings();

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Customer bookings — each one bundles one or more bed reservations protected by the per-bed overlap constraint."
      />

      {!res.ok ? (
        <DbStatusBanner error={res.error} />
      ) : res.data.length === 0 ? (
        <EmptyState
          icon={<IconClipboard />}
          title="No bookings yet"
          description="Customers can book at /pgs. Each row links into the booking detail with cancel + record-offline-payment controls."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Code</TH>
              <TH>Customer</TH>
              <TH>Status</TH>
              <TH>Duration</TH>
              <TH>Checkout</TH>
              <TH className="text-right">Total</TH>
              <TH>Created</TH>
            </TR>
          </THead>
          <TBody>
            {res.data.map((b) => (
              <TR key={b.id}>
                <TD className="font-medium">
                  <Link
                    href={`/admin/bookings/${b.id}`}
                    className="text-indigo-600 hover:text-indigo-700 hover:underline"
                  >
                    {b.bookingCode}
                  </Link>
                </TD>
                <TD>{b.customerName}</TD>
                <TD>
                  <Badge tone={toneForStatus(b.status)}>{titleCase(b.status)}</Badge>
                </TD>
                <TD>{titleCase(b.durationMode)}</TD>
                <TD>{formatDate(b.expectedCheckoutDate)}</TD>
                <TD className="text-right tabular-nums">{paiseToInr(b.totalPaise)}</TD>
                <TD>{formatDateTime(b.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
