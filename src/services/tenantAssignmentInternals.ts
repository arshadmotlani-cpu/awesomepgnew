import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds } from '@/src/db/schema';

export async function siblingBedIdsInRoom(primaryBedId: string): Promise<string[]> {
  const [row] = await db
    .select({ roomId: beds.roomId })
    .from(beds)
    .where(eq(beds.id, primaryBedId))
    .limit(1);
  if (!row) return [];

  const siblings = await db
    .select({ id: beds.id })
    .from(beds)
    .where(
      sql`${beds.roomId} = ${row.roomId}
        AND ${beds.id} != ${primaryBedId}
        AND ${beds.archivedAt} IS NULL`,
    );
  return siblings.map((s) => s.id);
}
