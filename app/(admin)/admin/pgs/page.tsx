import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconBuilding } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { listPgs } from '@/src/db/queries/admin';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { adminHasPermission } from '@/src/lib/auth/roles';
import { titleCase } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function PgsPage() {
  const session = await requireAdminSession('/admin/pgs');
  const canWrite = adminHasPermission(session.role, 'pgs:write');
  const res = await listPgs();

  return (
    <>
      <PageHeader
        title="PG listings"
        description="Open Bed map to see every room and tenant, or Edit to manage listing, rooms, and collections."
        actions={
          canWrite ? (
            <Link
              href="/admin/pgs/new"
              className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              + Add PG
            </Link>
          ) : null
        }
      />

      {!res.ok ? (
        <DbStatusBanner error={res.error} />
      ) : res.data.length === 0 ? (
        <EmptyState
          icon={<IconBuilding />}
          title="No PGs yet"
          description="Create a listing or run npm run db:seed for demo data."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Location</TH>
              <TH>Gender policy</TH>
              <TH className="text-right">Beds</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {res.data.map((row) => (
              <TR key={row.id}>
                <TD className="font-medium text-zinc-900">
                  {row.name}
                  <div className="text-xs font-normal text-zinc-500">{row.slug}</div>
                </TD>
                <TD>
                  {row.city}, {row.state}
                  <div className="text-xs text-zinc-500">PIN {row.pincode}</div>
                </TD>
                <TD>{titleCase(row.genderPolicy)}</TD>
                <TD className="text-right tabular-nums">{row.bedCount}</TD>
                <TD>
                  <Badge tone={row.isActive ? 'emerald' : 'zinc'}>
                    {row.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TD>
                <TD>
                  {canWrite ? (
                    <div className="flex flex-col items-end gap-1">
                      <Link
                        href={`/admin/pgs/${row.id}/map`}
                        className="text-sm font-semibold text-[#FF5A1F] hover:underline"
                      >
                        Bed map →
                      </Link>
                      <Link
                        href={`/admin/pgs/${row.id}/listing`}
                        className="text-xs text-zinc-500 hover:text-[#FF5A1F] hover:underline"
                      >
                        Setup
                      </Link>
                    </div>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
