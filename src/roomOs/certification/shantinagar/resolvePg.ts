/**
 * Resolve Shantinagar PG for certification runs.
 */

import { ilike } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { pgs } from '@/src/db/schema';

export async function resolveShantinagarPgId(): Promise<{ pgId: string; pgName: string } | null> {
  const [pg] = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(ilike(pgs.name, '%shanti%'))
    .limit(1);
  if (!pg) return null;
  return { pgId: pg.id, pgName: pg.name };
}
