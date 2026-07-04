/**
 * Cross-surface availability verification — admin SSOT, website list, room pages.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { floors, pgs, rooms } from '@/src/db/schema';
import { listPublicPgs } from '@/src/db/queries/customer';
import {
  getPgAvailabilitySummaries,
  getRoomAvailabilitySummaries,
} from '@/src/services/availabilityService';

export type SurfaceAvailabilityRow = {
  pgId: string;
  pgName: string;
  adminAvailable: number;
  adminOccupied: number;
  adminMaintenance: number;
  websiteAvailable: number;
  websiteOccupied: number;
  websiteMaintenance: number;
  roomPageAvailableSum: number;
  roomPageOccupiedSum: number;
  roomPageMaintenanceSum: number;
  match: boolean;
  mismatchDetails: string[];
};

export type ProductionSurfaceVerificationReport = {
  generatedAt: string;
  allMatch: boolean;
  rows: SurfaceAvailabilityRow[];
};

export async function verifyProductionSurfaceParity(): Promise<ProductionSurfaceVerificationReport> {
  const pgRows = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(and(isNull(pgs.archivedAt), eq(pgs.isActive, true)))
    .orderBy(pgs.displayOrder, pgs.name);

  const adminSummaries = await getPgAvailabilitySummaries(pgRows.map((p) => p.id));
  const publicList = await listPublicPgs();
  const websiteByPg = new Map(
    publicList.ok ? publicList.data.map((p) => [p.id, p]) : [],
  );

  const roomRows = await db
    .select({ roomId: rooms.id, pgId: floors.pgId, pgName: pgs.name, roomNumber: rooms.roomNumber })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        isNull(rooms.archivedAt),
        isNull(floors.archivedAt),
        isNull(pgs.archivedAt),
        eq(pgs.isActive, true),
      ),
    );

  const roomSummaries = await getRoomAvailabilitySummaries(roomRows.map((r) => r.roomId));
  const roomSumsByPg = new Map<
    string,
    { available: number; occupied: number; maintenance: number }
  >();

  for (const room of roomRows) {
    const summary = roomSummaries.get(room.roomId);
    const current = roomSumsByPg.get(room.pgId) ?? {
      available: 0,
      occupied: 0,
      maintenance: 0,
    };
    current.available += summary?.availableBeds ?? 0;
    current.occupied += summary?.occupiedBeds ?? 0;
    current.maintenance += summary?.maintenanceBeds ?? 0;
    roomSumsByPg.set(room.pgId, current);
  }

  const rows: SurfaceAvailabilityRow[] = pgRows.map((pg) => {
    const admin = adminSummaries.get(pg.id);
    const website = websiteByPg.get(pg.id);
    const roomSum = roomSumsByPg.get(pg.id) ?? { available: 0, occupied: 0, maintenance: 0 };
    const mismatchDetails: string[] = [];

    const adminAvailable = admin?.availableBeds ?? 0;
    const adminOccupied = admin?.occupiedBeds ?? 0;
    const adminMaintenance = admin?.maintenanceBeds ?? 0;
    const websiteAvailable = website?.availableBeds ?? -1;
    const websiteOccupied = website?.occupiedBeds ?? -1;
    const websiteMaintenance = website?.maintenanceBeds ?? -1;

    if (websiteAvailable !== adminAvailable) {
      mismatchDetails.push(`website available ${websiteAvailable} ≠ admin ${adminAvailable}`);
    }
    if (websiteOccupied !== adminOccupied) {
      mismatchDetails.push(`website occupied ${websiteOccupied} ≠ admin ${adminOccupied}`);
    }
    if (websiteMaintenance !== adminMaintenance) {
      mismatchDetails.push(
        `website maintenance ${websiteMaintenance} ≠ admin ${adminMaintenance}`,
      );
    }
    if (roomSum.available !== adminAvailable) {
      mismatchDetails.push(`room pages available sum ${roomSum.available} ≠ admin ${adminAvailable}`);
    }
    if (roomSum.occupied !== adminOccupied) {
      mismatchDetails.push(`room pages occupied sum ${roomSum.occupied} ≠ admin ${adminOccupied}`);
    }
    if (roomSum.maintenance !== adminMaintenance) {
      mismatchDetails.push(
        `room pages maintenance sum ${roomSum.maintenance} ≠ admin ${adminMaintenance}`,
      );
    }

    return {
      pgId: pg.id,
      pgName: pg.name,
      adminAvailable,
      adminOccupied,
      adminMaintenance,
      websiteAvailable,
      websiteOccupied,
      websiteMaintenance,
      roomPageAvailableSum: roomSum.available,
      roomPageOccupiedSum: roomSum.occupied,
      roomPageMaintenanceSum: roomSum.maintenance,
      match: mismatchDetails.length === 0,
      mismatchDetails,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    allMatch: rows.every((r) => r.match),
    rows,
  };
}

export function formatSurfaceVerificationReport(report: ProductionSurfaceVerificationReport): string {
  const lines: string[] = [];
  lines.push('## Cross-surface availability verification');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`All surfaces match: ${report.allMatch ? 'YES' : 'NO'}`);
  lines.push('');
  lines.push('| PG | Admin avail/occ/maint | Website | Room pages sum | Match |');
  lines.push('|----|----------------------|---------|----------------|-------|');
  for (const row of report.rows) {
    lines.push(
      `| ${row.pgName} | ${row.adminAvailable}/${row.adminOccupied}/${row.adminMaintenance} | ${row.websiteAvailable}/${row.websiteOccupied}/${row.websiteMaintenance} | ${row.roomPageAvailableSum}/${row.roomPageOccupiedSum}/${row.roomPageMaintenanceSum} | ${row.match ? 'OK' : row.mismatchDetails.join('; ')} |`,
    );
  }
  return lines.join('\n');
}
