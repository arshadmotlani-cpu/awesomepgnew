/* eslint-disable no-console */
/**
 * READ-ONLY — Room 201 B1 occupancy vs map SSOT (production).
 * USE_PRODUCTION_DB=1 npx tsx scripts/verify-room201-b1-occupancy-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('verify-room201-b1-occupancy-readonly.ts');

import { closeDb, db } from '../src/db/client';
import { adminUsers, pgs } from '../src/db/schema';
import { eq, ilike } from 'drizzle-orm';
import { getPgBedMap } from '../src/services/pgBedMap';
import { fetchBedOccupancyRows, resolveBedOccupancyRows } from '../src/services/bedOccupancyBatch';
import type { AdminSession } from '../src/lib/auth/session';

const B1 = 'f85878bf-abaa-4592-bb8b-47d44e287466';

async function main() {
  const [pg] = await db.select().from(pgs).where(ilike(pgs.name, '%SHANTINAGAR%')).limit(1);
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.role, 'super_admin')).limit(1);
  if (!pg || !admin) throw new Error('pg or admin missing');

  const session: AdminSession = {
    kind: 'admin',
    sessionId: 'verify-room201-b1',
    adminId: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.role,
    pgScope: admin.pgScope ?? [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 3600000),
  };

  const map = await getPgBedMap(session, pg.id);
  const b1 = map?.floors.flatMap((f) => f.rooms).find((r) => r.roomNumber === '201')?.beds.find((b) => b.bedId === B1);

  const rows = await fetchBedOccupancyRows({ bedId: B1 });
  const resolved = rows[0] ? resolveBedOccupancyRows(rows)[0] : null;

  console.log(
    JSON.stringify(
      {
        bedId: B1,
        map: b1
          ? {
              label: b1.availability.label,
              kind: b1.availability.kind,
              isBookableEngine: resolved?.isBookable,
              isOccupiedToday: b1.isOccupiedToday,
              tenancyBlocksBookability: b1.tenancyBlocksBookability,
              bedStatusColumn: b1.bedStatus,
              occupant: b1.occupant?.bookingCode ?? null,
              blockReason: b1.blockReason,
            }
          : null,
        batch: rows[0] ?? null,
      },
      null,
      2,
    ),
  );

  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
