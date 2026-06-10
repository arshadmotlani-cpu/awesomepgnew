import { Badge } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconDoor } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { listRooms } from '@/src/db/queries/admin';

export const dynamic = 'force-dynamic';

export default async function RoomsPage() {
  const res = await listRooms();

  return (
    <>
      <PageHeader
        title="Rooms"
        description="Every room with its sharing type and bed count. Beds are the bookable unit; rooms are the container."
      />

      {!res.ok ? (
        <DbStatusBanner error={res.error} />
      ) : res.data.length === 0 ? (
        <EmptyState
          icon={<IconDoor />}
          title="No rooms yet"
          description="Seed inventory or add rooms once admin CRUD ships."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>PG</TH>
              <TH>Floor</TH>
              <TH>Room</TH>
              <TH>Type</TH>
              <TH>Capacity</TH>
              <TH>AC</TH>
              <TH className="text-right">Beds</TH>
            </TR>
          </THead>
          <TBody>
            {res.data.map((row) => (
              <TR key={row.id}>
                <TD>{row.pgName}</TD>
                <TD>{row.floorLabel}</TD>
                <TD className="font-medium text-zinc-900">{row.roomNumber}</TD>
                <TD>{row.roomType}</TD>
                <TD className="tabular-nums">{row.capacity}</TD>
                <TD>
                  <Badge tone={row.hasAc ? 'sky' : 'zinc'}>
                    {row.hasAc ? 'AC' : 'Non-AC'}
                  </Badge>
                </TD>
                <TD className="text-right tabular-nums">{row.bedCount}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
