/** Read-only PG options for Owner OS property linking (no admin guard). */
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { pgs } from '@/src/db/schema';

export type OwnerPgOption = {
  id: string;
  name: string;
  city: string;
};

export async function listOwnerPgOptions(): Promise<OwnerPgOption[]> {
  try {
    const rows = await db
      .select({ id: pgs.id, name: pgs.name, city: pgs.city })
      .from(pgs)
      .where(eq(pgs.isActive, true))
      .orderBy(pgs.name);
    return rows;
  } catch {
    return [];
  }
}

export async function getOwnerPgName(pgId: string): Promise<string | null> {
  try {
    const [row] = await db
      .select({ name: pgs.name })
      .from(pgs)
      .where(eq(pgs.id, pgId))
      .limit(1);
    return row?.name ?? null;
  } catch {
    return null;
  }
}
