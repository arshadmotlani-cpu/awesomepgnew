import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconUsers } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { listPendingKycSubmissions } from '@/src/services/kyc';
import { formatDateTime, titleCase } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminKycPage() {
  const rows = await listPendingKycSubmissions();

  return (
    <>
      <PageHeader
        title="KYC review"
        description="Pending identity submissions from residents. Approve before check-in."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<IconUsers />}
          title="No pending KYC"
          description="New submissions appear here after residents pay for a booking."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Resident</TH>
              <TH>Phone</TH>
              <TH>Email</TH>
              <TH>Submitted</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium text-zinc-900">{r.customerName}</TD>
                <TD>{r.customerPhone}</TD>
                <TD>{r.customerEmail}</TD>
                <TD>{formatDateTime(r.createdAt)}</TD>
                <TD>
                  <Badge tone={toneForStatus(r.status)}>{titleCase(r.status)}</Badge>
                </TD>
                <TD className="text-right">
                  <Link
                    href={`/admin/kyc/${r.id}`}
                    className="text-sm font-medium text-indigo-600 hover:underline"
                  >
                    Review →
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
