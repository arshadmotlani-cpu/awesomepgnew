import { Card, CardBody, CardHeader } from '@/src/components/admin/Card';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconChart } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { getOccupancyByFloor, getOccupancyByPg } from '@/src/db/queries/admin';

export const dynamic = 'force-dynamic';

function Bar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-32 rounded-full bg-zinc-100">
        <div
          className="h-2 rounded-full bg-indigo-500"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-zinc-600">{pct}%</span>
    </div>
  );
}

export default async function OccupancyPage() {
  const [byPg, byFloor] = await Promise.all([getOccupancyByPg(), getOccupancyByFloor()]);

  return (
    <>
      <PageHeader
        title="Occupancy"
        description="Live occupancy snapshot for today. Phase 6 will add the 90-day heatmap and revenue overlays."
      />

      <Card>
        <CardHeader title="By PG" description="Today's occupancy per property." />
        {!byPg.ok ? (
          <CardBody>
            <DbStatusBanner error={byPg.error} />
          </CardBody>
        ) : byPg.data.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<IconChart />}
              title="No data yet"
              description="Seed inventory to see occupancy figures."
            />
          </CardBody>
        ) : (
          <Table className="rounded-none border-0 shadow-none">
            <THead>
              <TR>
                <TH>PG</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Occupied</TH>
                <TH className="text-right">Available</TH>
                <TH className="text-right">Blocked</TH>
                <TH>Today</TH>
              </TR>
            </THead>
            <TBody>
              {byPg.data.map((row) => (
                <TR key={row.pgId}>
                  <TD className="font-medium text-zinc-900">{row.pgName}</TD>
                  <TD className="text-right tabular-nums">{row.totalBeds}</TD>
                  <TD className="text-right tabular-nums">{row.occupiedBeds}</TD>
                  <TD className="text-right tabular-nums">{row.availableBeds}</TD>
                  <TD className="text-right tabular-nums">{row.blockedBeds}</TD>
                  <TD>
                    <Bar pct={row.occupancyPct} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="By floor" description="Occupancy broken down floor-by-floor." />
        {!byFloor.ok ? (
          <CardBody>
            <DbStatusBanner error={byFloor.error} />
          </CardBody>
        ) : byFloor.data.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<IconChart />}
              title="No data yet"
              description="Seed inventory to see occupancy figures."
            />
          </CardBody>
        ) : (
          <Table className="rounded-none border-0 shadow-none">
            <THead>
              <TR>
                <TH>PG</TH>
                <TH>Floor</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Occupied</TH>
                <TH>Today</TH>
              </TR>
            </THead>
            <TBody>
              {byFloor.data.map((row, i) => (
                <TR key={`${row.pgName}-${row.floorNumber}-${i}`}>
                  <TD>{row.pgName}</TD>
                  <TD className="font-medium text-zinc-900">{row.floorLabel}</TD>
                  <TD className="text-right tabular-nums">{row.totalBeds}</TD>
                  <TD className="text-right tabular-nums">{row.occupiedBeds}</TD>
                  <TD>
                    <Bar pct={row.occupancyPct} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
