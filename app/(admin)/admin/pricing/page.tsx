import { requireAdminSession } from '@/src/lib/auth/guards';
import { listPgs } from '@/src/db/queries/admin';
import { getPgInventory } from '@/src/services/pgInventory';
import { PricingCenter, type PricingCenterRoom } from '@/src/components/admin/PricingCenter';

export const metadata = { title: 'Pricing Center' };

export const dynamic = 'force-dynamic';

type SearchParams = { pgId?: string };

export default async function AdminPricingPage(props: PageProps<'/admin/pricing'>) {
  const session = await requireAdminSession();
  const sp = (await props.searchParams) as SearchParams;

  const pgsResult = await listPgs();
  const allPgs = (pgsResult.ok ? pgsResult.data : []).filter((p) =>
    session.role === 'super_admin' || session.pgScope.length === 0
      ? true
      : session.pgScope.includes(p.id),
  );

  if (allPgs.length === 0) {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-600">No PGs available.</p>
      </div>
    );
  }

  const pgId = sp.pgId && allPgs.some((p) => p.id === sp.pgId) ? sp.pgId : allPgs[0]!.id;
  const inv = await getPgInventory(session, pgId);

  const roomMap = new Map<string, PricingCenterRoom>();
  for (const bed of inv.beds) {
    let room = roomMap.get(bed.roomId);
    if (!room) {
      room = {
        roomId: bed.roomId,
        roomNumber: bed.roomNumber,
        floorLabel: bed.floorLabel,
        beds: [],
      };
      roomMap.set(bed.roomId, room);
    }
    room.beds.push(bed);
  }
  const rooms = Array.from(roomMap.values()).sort((a, b) =>
    a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }),
  );

  return (
    <div className="p-4 sm:p-6">
      <PricingCenter
        pgs={allPgs.map((p) => ({ id: p.id, name: p.name, slug: p.slug }))}
        initialPgId={pgId}
        rooms={rooms}
      />
    </div>
  );
}
