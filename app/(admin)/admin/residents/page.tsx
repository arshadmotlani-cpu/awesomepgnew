import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconUsers } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { listResidents } from '@/src/db/queries/admin';
import { formatDateTime, titleCase } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function ResidentsPage() {
  const res = await listResidents();

  return (
    <>
      <PageHeader
        title="Residents"
        description="Every customer who has registered with Awesome PG. KYC, contact details, and residency history live here."
      />

      {!res.ok ? (
        <DbStatusBanner error={res.error} />
      ) : res.data.length === 0 ? (
        <EmptyState
          icon={<IconUsers />}
          title="No residents yet"
          description="Customers appear here when they place their first booking."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Phone</TH>
              <TH>Gender</TH>
              <TH>KYC</TH>
              <TH>Joined</TH>
            </TR>
          </THead>
          <TBody>
            {res.data.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium text-zinc-900">{r.fullName}</TD>
                <TD>{r.email}</TD>
                <TD>{r.phone}</TD>
                <TD>{titleCase(r.gender)}</TD>
                <TD>
                  <Badge tone={toneForStatus(r.kycStatus)}>{titleCase(r.kycStatus)}</Badge>
                </TD>
                <TD>{formatDateTime(r.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
