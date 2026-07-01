import type { PricingCenterPg, PricingCenterRoom } from '@/src/components/admin/PricingCenter';
import type { AdminSession } from '@/src/lib/auth/session';
import { listPgs } from '@/src/db/queries/admin';
import { getPgInventory } from '@/src/services/pgInventory';

export async function loadPricingCommandCenterData(
  session: AdminSession,
  pgIdInput?: string | null,
): Promise<{
  pgs: PricingCenterPg[];
  initialPgId: string;
  rooms: PricingCenterRoom[];
}> {
  const res = await listPgs();
  const pgs: PricingCenterPg[] = res.ok
    ? res.data.map((p) => ({ id: p.id, name: p.name, slug: p.slug }))
    : [];

  const initialPgId =
    pgIdInput && pgs.some((p) => p.id === pgIdInput) ? pgIdInput : (pgs[0]?.id ?? '');
  if (!initialPgId) {
    return { pgs, initialPgId: '', rooms: [] };
  }

  const inv = await getPgInventory(session, initialPgId);
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

  return {
    pgs,
    initialPgId,
    rooms: [...roomMap.values()].sort((a, b) => a.roomNumber.localeCompare(b.roomNumber)),
  };
}
