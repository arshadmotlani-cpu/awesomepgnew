/**
 * Capital attention signals for Owner OS — read-only count only.
 */
import { eq, sql } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import { acAssets } from '@/src/capital/db/schema';

export async function countCapitalSoldAwaitingSettlement(): Promise<number> {
  const [row] = await capitalDb
    .select({ count: sql<number>`count(*)::int` })
    .from(acAssets)
    .where(eq(acAssets.status, 'sold'));
  return Number(row?.count ?? 0);
}
