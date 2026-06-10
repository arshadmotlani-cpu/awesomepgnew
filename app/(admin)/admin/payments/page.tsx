import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconCard } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { listPayments } from '@/src/db/queries/admin';
import { formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const res = await listPayments();

  return (
    <>
      <PageHeader
        title="Payments"
        description="Ledger of every payment captured by the system. Refunds appear as negative amounts; offline cash entries appear with provider 'cash'."
      />

      {!res.ok ? (
        <DbStatusBanner error={res.error} />
      ) : res.data.length === 0 ? (
        <EmptyState
          icon={<IconCard />}
          title="No payments yet"
          description="Payments will appear here as soon as customers complete checkout or an admin records an offline payment."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Booking</TH>
              <TH>Purpose</TH>
              <TH>Provider</TH>
              <TH>Status</TH>
              <TH className="text-right">Amount</TH>
              <TH>Paid at</TH>
            </TR>
          </THead>
          <TBody>
            {res.data.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium text-zinc-900">{p.bookingCode}</TD>
                <TD>{titleCase(p.purpose)}</TD>
                <TD>{titleCase(p.provider)}</TD>
                <TD>
                  <Badge tone={toneForStatus(p.status)}>{titleCase(p.status)}</Badge>
                </TD>
                <TD className="text-right tabular-nums">
                  {paiseToInr(p.amountPaise)} {p.currency !== 'INR' ? p.currency : ''}
                </TD>
                <TD>{formatDateTime(p.paidAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
