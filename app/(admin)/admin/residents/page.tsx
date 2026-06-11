import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconUsers } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { formatDateTime, titleCase } from '@/src/lib/format';
import { listResidentsForAdmin } from '@/src/services/residentAdmin';

export const dynamic = 'force-dynamic';

export default async function ResidentsPage() {
  let residents;
  try {
    const session = await requireAdminPermission('bookings:write');
    residents = await listResidentsForAdmin(session);
  } catch (err) {
    return (
      <>
        <PageHeader title="Residents" />
        <DbStatusBanner error={err instanceof Error ? err.message : String(err)} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Residents"
        description="Everyone who signed up on the website. Tenants with an active bed show their room; others can be assigned manually. Online checkout still auto-assigns when they pay."
        actions={
          <Link
            href="/admin/bookings/new"
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Assign tenant
          </Link>
        }
      />

      {residents.length === 0 ? (
        <EmptyState
          icon={<IconUsers />}
          title="No residents yet"
          description="Customers appear here when they sign up on the website or are assigned by admin."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Room / status</TH>
              <TH>Phone</TH>
              <TH>KYC</TH>
              <TH>Joined</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {residents.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium text-zinc-900">
                  <Link href={`/admin/residents/${r.id}`} className="hover:text-[#FF5A1F]">
                    {r.fullName}
                  </Link>
                  <p className="text-xs font-normal text-zinc-500">{r.email}</p>
                </TD>
                <TD>
                  {r.tenancyStatus === 'active' && r.pgName ? (
                    <span className="text-sm">
                      {r.pgName} · Room {r.roomNumber} · {r.bedCode}
                    </span>
                  ) : (
                    <Badge tone="amber">Unassigned</Badge>
                  )}
                </TD>
                <TD>{r.phone}</TD>
                <TD>
                  <Badge tone={toneForStatus(r.kycStatus)}>{titleCase(r.kycStatus)}</Badge>
                </TD>
                <TD>{formatDateTime(r.createdAt)}</TD>
                <TD className="text-right">
                  <Link
                    href={
                      r.tenancyStatus === 'active'
                        ? `/admin/residents/${r.id}`
                        : `/admin/bookings/new?customerId=${r.id}`
                    }
                    className="text-sm font-semibold text-[#FF5A1F] hover:underline"
                  >
                    {r.tenancyStatus === 'active' ? 'Manage' : 'Assign'}
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
