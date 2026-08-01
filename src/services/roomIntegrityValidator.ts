/**
 * Room integrity validator — read-only DB loader + reports.
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { pgs } from '@/src/db/schema';
import { roomIntegrityResult } from '@/src/lib/roomIntegrity/validateRoomIntegrity';
import type {
  AllPgsRoomIntegrityReport,
  PgRoomIntegrityReport,
  RoomIntegrityResult,
  RoomIntegritySnapshot,
} from '@/src/lib/roomIntegrity/types';

type RawRoomRow = {
  room_id: string;
  pg_id: string;
  pg_name: string;
  room_number: string;
  room_type_name: string;
  stored_capacity: number;
  physical_beds: number;
  bookable_beds: number;
  blocked_beds: number;
  maintenance_beds: number;
  occupied_beds: number;
};

const ROOM_INTEGRITY_SQL = sql`
  SELECT r.id::text AS room_id,
         p.id::text AS pg_id,
         p.name AS pg_name,
         r.room_number,
         rt.name AS room_type_name,
         rt.default_capacity::int AS stored_capacity,
         count(b.id)::int AS physical_beds,
         count(b.id) FILTER (WHERE b.status = 'available')::int AS bookable_beds,
         count(b.id) FILTER (WHERE b.status = 'blocked')::int AS blocked_beds,
         count(b.id) FILTER (WHERE b.status = 'maintenance')::int AS maintenance_beds,
         (
           SELECT count(DISTINCT bk.id)::int
           FROM beds bx
           JOIN bed_reservations br ON br.bed_id = bx.id AND br.kind = 'primary' AND br.status = 'active'
           JOIN bookings bk ON bk.id = br.booking_id AND bk.status = 'confirmed'
           JOIN customers c ON c.id = bk.customer_id AND c.is_test = false
           WHERE bx.room_id = r.id
             AND CURRENT_DATE <@ br.stay_range
         ) AS occupied_beds
  FROM rooms r
  JOIN room_types rt ON rt.id = r.room_type_id
  JOIN floors f ON f.id = r.floor_id
  JOIN pgs p ON p.id = f.pg_id
  LEFT JOIN beds b ON b.room_id = r.id AND b.archived_at IS NULL
  WHERE r.archived_at IS NULL
    AND f.archived_at IS NULL
    AND p.archived_at IS NULL
`;

function toSnapshot(row: RawRoomRow): RoomIntegritySnapshot {
  return {
    roomId: row.room_id,
    pgId: row.pg_id,
    pgName: row.pg_name,
    roomNumber: row.room_number,
    roomTypeName: row.room_type_name,
    storedCapacity: row.stored_capacity,
    physicalBeds: row.physical_beds,
    bookableBeds: row.bookable_beds,
    blockedBeds: row.blocked_beds,
    maintenanceBeds: row.maintenance_beds,
    occupiedBeds: row.occupied_beds,
  };
}

async function loadRawRoomRows(opts?: { pgId?: string; roomId?: string }): Promise<RawRoomRow[]> {
  if (opts?.roomId) {
    return db.execute<RawRoomRow>(sql`
      ${ROOM_INTEGRITY_SQL}
      AND r.id = ${opts.roomId}::uuid
      GROUP BY p.id, p.name, r.id, r.room_number, rt.name, rt.default_capacity
      ORDER BY p.name, r.room_number
    `);
  }
  if (opts?.pgId) {
    return db.execute<RawRoomRow>(sql`
      ${ROOM_INTEGRITY_SQL}
      AND f.pg_id = ${opts.pgId}::uuid
      GROUP BY p.id, p.name, r.id, r.room_number, rt.name, rt.default_capacity
      ORDER BY r.room_number
    `);
  }
  return db.execute<RawRoomRow>(sql`
    ${ROOM_INTEGRITY_SQL}
    GROUP BY p.id, p.name, r.id, r.room_number, rt.name, rt.default_capacity
    ORDER BY p.name, r.room_number
  `);
}

export async function validateRoomById(roomId: string): Promise<RoomIntegrityResult | null> {
  const rows = await loadRawRoomRows({ roomId });
  const row = rows[0];
  if (!row) return null;
  return roomIntegrityResult(toSnapshot(row));
}

export async function getRoomIntegrityReportForPg(pgId: string): Promise<PgRoomIntegrityReport> {
  const rows = await loadRawRoomRows({ pgId });
  const roomsResults = rows.map((row) => roomIntegrityResult(toSnapshot(row)));
  const [pg] = await db.select({ name: pgs.name }).from(pgs).where(eq(pgs.id, pgId)).limit(1);

  return {
    pgId,
    pgName: pg?.name ?? pgId,
    roomsScanned: roomsResults.length,
    roomsWithIssues: roomsResults.filter((r) => r.hasMismatch).length,
    rooms: roomsResults,
  };
}

export async function getAllPgsRoomIntegrityReport(): Promise<AllPgsRoomIntegrityReport> {
  const rows = await loadRawRoomRows();
  const byPg = new Map<string, RoomIntegrityResult[]>();

  for (const row of rows) {
    const result = roomIntegrityResult(toSnapshot(row));
    const list = byPg.get(result.pgId) ?? [];
    list.push(result);
    byPg.set(result.pgId, list);
  }

  const reports: PgRoomIntegrityReport[] = [];
  for (const [pgId, pgRooms] of byPg) {
    reports.push({
      pgId,
      pgName: pgRooms[0]?.pgName ?? pgId,
      roomsScanned: pgRooms.length,
      roomsWithIssues: pgRooms.filter((r) => r.hasMismatch).length,
      rooms: pgRooms,
    });
  }

  reports.sort((a, b) => a.pgName.localeCompare(b.pgName));

  return {
    generatedAt: new Date().toISOString(),
    pgsScanned: reports.length,
    totalRooms: rows.length,
    totalRoomsWithIssues: rows.filter((r) => roomIntegrityResult(toSnapshot(r)).hasMismatch)
      .length,
    reports,
  };
}

/** Map roomId → integrity result for admin UI badges. */
export async function getRoomIntegrityMapForPg(
  pgId: string,
): Promise<Map<string, RoomIntegrityResult>> {
  const report = await getRoomIntegrityReportForPg(pgId);
  return new Map(report.rooms.map((r) => [r.roomId, r]));
}

/** Load current counts for a room — used before proposed-state validation. */
export async function loadRoomIntegrityCounts(roomId: string): Promise<RoomIntegritySnapshot | null> {
  return validateRoomById(roomId);
}

/** After sync, assert room is consistent (throws if still broken). */
export async function assertRoomIntegrityOrThrow(roomId: string): Promise<void> {
  const result = await validateRoomById(roomId);
  if (!result || !result.hasMismatch) return;
  throw new Error(
    `Room configuration mismatch after save: ${result.issues.map((i) => i.message).join('; ')}`,
  );
}
