import { notFound } from 'next/navigation';
import { PgBedMapPanel } from '@/src/components/admin/PgBedMapPanel';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { getPgBedMap } from '@/src/services/pgBedMap';
import { getPgForAdmin } from '@/src/services/pgAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PgBedMapPage({ params }: { params: Promise<{ pgId: string }> }) {
  const session = await requireAdminPermission('pgs:write');
  const { pgId } = await params;
  const pg = await getPgForAdmin(pgId, session);
  if (!pg) notFound();

  const map = await getPgBedMap(session, pgId);
  if (!map) notFound();

  const moveBedOptions: Array<{ bedId: string; label: string }> = [];

  for (const floor of map.floors) {
    for (const room of floor.rooms) {
      for (const bed of room.beds) {
        const label = `${pg.name} · Room ${room.roomNumber} · ${bed.bedCode}`;
        if (!bed.isOccupiedToday && bed.bedStatus === 'available') {
          moveBedOptions.push({ bedId: bed.bedId, label });
        }
      }
    }
  }

  for (const floor of map.floors) {
    for (const room of floor.rooms) {
      for (const bed of room.beds) {
        if (bed.occupant && !moveBedOptions.some((opt) => opt.bedId === bed.bedId)) {
          moveBedOptions.unshift({
            bedId: bed.bedId,
            label: `${pg.name} · Room ${room.roomNumber} · ${bed.bedCode} (current)`,
          });
        }
      }
    }
  }

  return (
    <>
      <PageHeader
        title={`Bed map — ${pg.name}`}
        description="Tap a bed to assign a resident, change rooms, or start move-out."
      />
      <PgBedMapPanel map={map} moveBedOptions={moveBedOptions} />
    </>
  );
}
