import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconBed } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { listBeds } from '@/src/db/queries/admin';
import { titleCase } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function BedsPage() {
  const res = await listBeds();

  return (
    <>
      <PageHeader
        title="Beds"
        description="The atomic unit of inventory. Every reservation in the system points at exactly one bed for one date range."
      />

      {!res.ok ? (
        <DbStatusBanner error={res.error} />
      ) : res.data.length === 0 ? (
        <EmptyState
          icon={<IconBed />}
          title="No beds yet"
          description="Seed inventory or add beds to a room once admin CRUD ships."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>PG</TH>
              <TH>Floor</TH>
              <TH>Room</TH>
              <TH>Bed</TH>
              <TH>Type</TH>
              <TH>Status</TH>
              <TH>Today</TH>
            </TR>
          </THead>
          <TBody>
            {res.data.map((row) => (
              <TR key={row.id}>
                <TD>{row.pgName}</TD>
                <TD>{row.floorLabel}</TD>
                <TD>{row.roomNumber}</TD>
                <TD className="font-medium text-zinc-900">{row.bedCode}</TD>
                <TD>{row.roomType}</TD>
                <TD>
                  <Badge tone={toneForStatus(row.status)}>{titleCase(row.status)}</Badge>
                </TD>
                <TD>
                  <Badge tone={row.isOccupiedToday ? 'rose' : 'emerald'}>
                    {row.isOccupiedToday ? 'Occupied' : 'Vacant'}
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
