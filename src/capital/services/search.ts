import { ilike, or, sql } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import { acAssets, acAutomotiveDetails } from '@/src/capital/db/schema';

export async function searchAssets(query: string, limit = 20) {
  const q = `%${query.trim()}%`;
  if (!query.trim()) return [];

  return capitalDb
    .select({ asset: acAssets, auto: acAutomotiveDetails })
    .from(acAssets)
    .innerJoin(acAutomotiveDetails, sql`${acAssets.id} = ${acAutomotiveDetails.assetId}`)
    .where(
      or(
        ilike(acAutomotiveDetails.registrationNumber, q),
        ilike(acAutomotiveDetails.manufacturer, q),
        ilike(acAutomotiveDetails.model, q),
        ilike(acAssets.displayName, q),
        ilike(acAssets.notes, q),
      ),
    )
    .limit(limit);
}
