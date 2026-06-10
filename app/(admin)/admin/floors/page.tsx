import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconLayers } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { listFloors } from '@/src/db/queries/admin';

export const dynamic = 'force-dynamic';

export default async function FloorsPage() {
  const res = await listFloors();

  return (
    <>
      <PageHeader
        title="Floors"
        description="All floors across every PG, with room and bed totals per floor."
      />

      {!res.ok ? (
        <DbStatusBanner error={res.error} />
      ) : res.data.length === 0 ? (
        <EmptyState
          icon={<IconLayers />}
          title="No floors yet"
          description="Floors will show up here as soon as inventory is seeded."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>PG</TH>
              <TH>Floor</TH>
              <TH>Label</TH>
              <TH className="text-right">Rooms</TH>
              <TH className="text-right">Beds</TH>
            </TR>
          </THead>
          <TBody>
            {res.data.map((row) => (
              <TR key={row.id}>
                <TD className="font-medium text-zinc-900">{row.pgName}</TD>
                <TD className="tabular-nums">{row.floorNumber}</TD>
                <TD>{row.label ?? '—'}</TD>
                <TD className="text-right tabular-nums">{row.roomCount}</TD>
                <TD className="text-right tabular-nums">{row.bedCount}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
