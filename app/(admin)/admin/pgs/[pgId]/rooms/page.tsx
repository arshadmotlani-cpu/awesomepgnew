import { notFound } from 'next/navigation';
import { ClearPgOccupancyButton } from '@/src/components/admin/ClearPgOccupancyButton';
import { MarkPgFullyOccupiedButton } from '@/src/components/admin/MarkPgFullyOccupiedButton';
import { PgRoomOperationsPanel } from '@/src/components/admin/PgRoomOperationsPanel';
import { loadRoomElectricityPendingForPg } from '@/src/lib/billing/roomElectricityPendingAdmin';
import { RoomElectricityPendingWarningCard } from '@/src/components/admin/electricity/RoomElectricityPendingWarningCard';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { getPgAvailabilitySummary } from '@/src/services/availabilityService';
import { getPgInventory } from '@/src/services/pgInventory';
import { getPgForAdmin } from '@/src/services/pgAdmin';
import { loadRoomExitQueuesForPg } from '@/src/lib/exit/loadRoomExitQueue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PgRoomsPage({ params }: { params: Promise<{ pgId: string }> }) {
  const session = await requireAdminPermission('pgs:write');
  const { pgId } = await params;
  const pg = await getPgForAdmin(pgId, session);
  if (!pg) notFound();

  const inventory = await getPgInventory(session, pgId);
  const availabilitySummary = await getPgAvailabilitySummary(pgId);
  const integrityReport = await getRoomIntegrityReportForPg(pgId);
  const electricityPending = await loadRoomElectricityPendingForPg({ pgId });
  const roomExitQueues = await loadRoomExitQueuesForPg(pgId);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">Beds, per-room rent, and sharing capacity.</p>
        <div className="flex flex-wrap items-center gap-2">
          <ClearPgOccupancyButton pgId={pgId} pgName={pg.name} />
          <MarkPgFullyOccupiedButton pgId={pgId} pgName={pg.name} />
        </div>
      </div>
      {electricityPending.length > 0 ? (
        <div className="mb-4 space-y-3">
          {electricityPending.map((room) => (
            <RoomElectricityPendingWarningCard key={room.roomId} room={room} />
          ))}
        </div>
      ) : null}
      <PgRoomOperationsPanel
        pgId={pgId}
        floors={inventory.floors}
        beds={inventory.beds}
        availabilitySummary={availabilitySummary}
        roomIntegrity={integrityReport.rooms}
        roomExitQueues={roomExitQueues}
      />
    </section>
  );
}
