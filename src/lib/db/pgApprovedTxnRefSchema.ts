/**
 * Detects pg_approved_transaction_refs shape: legacy PK on ref (0148) vs multi-row (0155).
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';

export type PgApprovedTxnRefSchemaMode = 'legacy_ref_pk' | 'multi_row';

let cache: PgApprovedTxnRefSchemaMode | null = null;
let cacheAt = 0;
const TTL_MS = 60_000;

export async function getPgApprovedTxnRefSchemaMode(): Promise<PgApprovedTxnRefSchemaMode> {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;

  const rows = await db.execute<{ column_name: string }>(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pg_approved_transaction_refs'
      AND column_name = 'id'
    LIMIT 1
  `);

  cache = rows.length > 0 ? 'multi_row' : 'legacy_ref_pk';
  cacheAt = Date.now();
  return cache;
}

/** Test helper — force re-probe after migrations in the same process. */
export function resetPgApprovedTxnRefSchemaModeCache(): void {
  cache = null;
  cacheAt = 0;
}
