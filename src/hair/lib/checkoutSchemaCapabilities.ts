import { sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';

let checkoutAttemptKeyColumn: boolean | null = null;
let checkoutOperationsTable: boolean | null = null;

/** Cached read-only probe — safe on every checkout. */
export async function hairCheckoutAttemptKeyColumnReady(): Promise<boolean> {
  if (checkoutAttemptKeyColumn !== null) return checkoutAttemptKeyColumn;
  const rows = await hairDb.execute<{ ok: number }>(sql`
    SELECT 1 AS ok
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fyh_invoices'
      AND column_name = 'checkout_attempt_key'
    LIMIT 1
  `);
  checkoutAttemptKeyColumn = rows.length > 0;
  return checkoutAttemptKeyColumn;
}

export async function hairCheckoutOperationsTableReady(): Promise<boolean> {
  if (checkoutOperationsTable !== null) return checkoutOperationsTable;
  const rows = await hairDb.execute<{ ok: number }>(sql`
    SELECT 1 AS ok
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'fyh_checkout_operations'
    LIMIT 1
  `);
  checkoutOperationsTable = rows.length > 0;
  return checkoutOperationsTable;
}

export function resetCheckoutSchemaCapabilitiesCacheForTests(): void {
  checkoutAttemptKeyColumn = null;
  checkoutOperationsTable = null;
}
