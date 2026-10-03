import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { floors, meterLogs, rooms } from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';

export async function getMeterLogImageForAdminSession(
  session: AdminSession,
  meterLogId: string,
): Promise<{ meterImageUrl: string | null } | null> {
  const [row] = await db
    .select({
      meterImageUrl: meterLogs.meterImageUrl,
      pgId: floors.pgId,
    })
    .from(meterLogs)
    .innerJoin(rooms, eq(rooms.id, meterLogs.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(meterLogs.id, meterLogId))
    .limit(1);

  if (!row) return null;
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pgId)) {
    return null;
  }

  return { meterImageUrl: row.meterImageUrl };
}
