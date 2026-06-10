import { Badge } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconBuilding } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { listPgs } from '@/src/db/queries/admin';
import { titleCase } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function PgsPage() {
  const res = await listPgs();

  return (
    <>
      <PageHeader
        title="PGs"
        description="Every property managed by Awesome PG. Phase 1 ships read-only views; CRUD wires up in Phase 6."
      />

      {!res.ok ? (
        <DbStatusBanner error={res.error} />
      ) : res.data.length === 0 ? (
        <EmptyState
          icon={<IconBuilding />}
          title="No PGs yet"
          description="Run npm run db:seed to populate the demo PG, or create one once admin CRUD lands."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Location</TH>
              <TH>Gender policy</TH>
              <TH className="text-right">Floors</TH>
              <TH className="text-right">Rooms</TH>
              <TH className="text-right">Beds</TH>
              <TH>Status</TH>
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
                <TD className="text-right tabular-nums">{row.floorCount}</TD>
                <TD className="text-right tabular-nums">{row.roomCount}</TD>
                <TD className="text-right tabular-nums">{row.bedCount}</TD>
                <TD>
                  <Badge tone={row.isActive ? 'emerald' : 'zinc'}>
                    {row.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
