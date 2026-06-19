import { eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds, pgs, rooms } from '@/src/db/schema';
import { getOccupancyByPg } from '@/src/db/queries/admin';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { buildBedAssignmentCommand, type AssignableBedRow } from '@/src/lib/beds/bedAssignmentCommand';
import { getPgBedMap } from '@/src/services/pgBedMap';
import {
  listResidentsForAdmin,
  listUnverifiedWebsiteSignupsForAdmin,
} from '@/src/services/residentAdmin';
import { listAssignableBeds } from '@/src/services/tenantAssignment';

export type { AssignableBedRow } from '@/src/lib/beds/bedAssignmentCommand';

/** Assignable beds with roomId for recommendation scoring. */
export async function listAssignableBedsWithRoom(
  session: AdminSession,
  startDate?: string,
): Promise<AssignableBedRow[]> {
  const rows = await listAssignableBeds(session, startDate);
  if (rows.length === 0) return [];

  const bedIds = rows.map((r) => r.bedId);
  const roomRows = await db
    .select({
      bedId: beds.id,
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
    })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(inArray(beds.id, bedIds));

  const roomByBed = new Map(roomRows.map((r) => [r.bedId, r]));

  return rows.map((r) => ({
    bedId: r.bedId,
    bedCode: r.bedCode,
    roomId: roomByBed.get(r.bedId)?.roomId ?? '',
    roomNumber: r.roomNumber,
    pgId: r.pgId,
    pgName: r.pgName,
    manualOccupied: r.manualOccupied,
    monthlyRatePaise: r.monthlyRatePaise,
    depositPaise: r.depositPaise,
  }));
}

export async function loadBedAssignmentCommand(session: AdminSession) {
  const [occupancyRes, residents, assignable, unverified] = await Promise.all([
    getOccupancyByPg(),
    listResidentsForAdmin(session),
    listAssignableBedsWithRoom(session),
    listUnverifiedWebsiteSignupsForAdmin(session),
  ]);

  const occupancy = (occupancyRes.ok ? occupancyRes.data : []).filter((pg) =>
    adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pg.pgId),
  );

  const maps = (
    await Promise.all(occupancy.map((pg) => getPgBedMap(session, pg.pgId)))
  ).filter((m): m is NonNullable<typeof m> => m !== null);

  return buildBedAssignmentCommand({
    occupancy,
    maps,
    residents,
    assignable,
    unverified,
  });
}

export async function loadPgBedMapForCommand(
  session: AdminSession,
  pgId: string,
): Promise<{
  map: Awaited<ReturnType<typeof getPgBedMap>>;
  moveBedOptions: Array<{ bedId: string; label: string }>;
}> {
  const map = await getPgBedMap(session, pgId);
  if (!map) return { map: null, moveBedOptions: [] };

  const [pgRow] = await db.select({ name: pgs.name }).from(pgs).where(eq(pgs.id, pgId)).limit(1);
  const pgName = pgRow?.name ?? 'PG';

  const moveBedOptions: Array<{ bedId: string; label: string }> = [];

  for (const floor of map.floors) {
    for (const room of floor.rooms) {
      for (const bed of room.beds) {
        const label = `${pgName} · Room ${room.roomNumber} · ${bed.bedCode}`;
        if (!bed.isOccupiedToday && bed.bedStatus === 'available') {
          moveBedOptions.push({ bedId: bed.bedId, label });
        }
        if (bed.occupant && !moveBedOptions.some((o) => o.bedId === bed.bedId)) {
          moveBedOptions.unshift({ bedId: bed.bedId, label: `${label} (current)` });
        }
      }
    }
  }

  return { map, moveBedOptions };
}
