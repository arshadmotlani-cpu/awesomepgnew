import { notFound } from 'next/navigation';
import { PgBedMapPanel } from '@/src/components/admin/PgBedMapPanel';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { getPgBedMap } from '@/src/services/pgBedMap';
import { getPgForAdmin } from '@/src/services/pgAdmin';
import { listAssignableBeds } from '@/src/services/tenantAssignment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PgBedMapPage({ params }: { params: Promise<{ pgId: string }> }) {
  const session = await requireAdminPermission('pgs:write');
  const { pgId } = await params;
  const pg = await getPgForAdmin(pgId, session);
  if (!pg) notFound();

  const [map, assignableBeds] = await Promise.all([
    getPgBedMap(session, pgId),
    listAssignableBeds(session),
  ]);
  if (!map) notFound();

  const moveBedOptions = assignableBeds.map((b) => ({
    bedId: b.bedId,
    label: `${b.pgName} · Room ${b.roomNumber} · ${b.bedCode}`,
  }));

  for (const floor of map.floors) {
    for (const room of floor.rooms) {
      for (const bed of room.beds) {
        if (
          bed.occupant &&
          !moveBedOptions.some((opt) => opt.bedId === bed.bedId)
        ) {
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
        title="Bed map"
        description="Click any bed like a movie seat — see the resident, shift rooms, open billing, or manage vacating."
      />
      <PgBedMapPanel map={map} moveBedOptions={moveBedOptions} />
    </>
  );
}
