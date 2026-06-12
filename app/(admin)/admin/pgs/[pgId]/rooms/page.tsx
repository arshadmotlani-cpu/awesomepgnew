import { notFound } from 'next/navigation';
import { ClearPgOccupancyButton } from '@/src/components/admin/ClearPgOccupancyButton';
import { MarkPgFullyOccupiedButton } from '@/src/components/admin/MarkPgFullyOccupiedButton';
import { PgRoomOperationsPanel } from '@/src/components/admin/PgRoomOperationsPanel';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { isBlobPublicConfigured } from '@/src/lib/storage/blob';
import { getPgInventory } from '@/src/services/pgInventory';
import { getPgForAdmin } from '@/src/services/pgAdmin';
import { getPgMeterSummaries } from '@/src/services/meterElectricity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PgRoomsPage({ params }: { params: Promise<{ pgId: string }> }) {
  const session = await requireAdminPermission('pgs:write');
  const { pgId } = await params;
  const pg = await getPgForAdmin(pgId, session);
  if (!pg) notFound();

  const inventory = await getPgInventory(session, pgId);
  const blobUpload = isBlobPublicConfigured();
  const meterSummaries = await getPgMeterSummaries(session, pgId);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          Beds, per-room rent, and room electricity meters.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ClearPgOccupancyButton pgId={pgId} pgName={pg.name} />
          <MarkPgFullyOccupiedButton pgId={pgId} pgName={pg.name} />
        </div>
      </div>
      <PgRoomOperationsPanel
        pgId={pgId}
        floors={inventory.floors}
        beds={inventory.beds}
        roomMeters={meterSummaries}
        blobUploadConfigured={blobUpload}
      />
    </section>
  );
}
