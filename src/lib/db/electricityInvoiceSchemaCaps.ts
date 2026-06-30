/**
 * Detects whether electricity_invoices migration 0087 columns exist in the live DB.
 * Cached briefly so read paths stay backward compatible before migrate runs.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';

export type ElectricityInvoiceSchemaCaps = {
  roomId: boolean;
  supersededByInvoiceId: boolean;
  duplicateDetectedAt: boolean;
};

let cache: ElectricityInvoiceSchemaCaps | null = null;
let cacheAt = 0;
const TTL_MS = 60_000;

export async function getElectricityInvoiceSchemaCaps(): Promise<ElectricityInvoiceSchemaCaps> {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;

  const rows = await db.execute<{ column_name: string }>(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'electricity_invoices'
      AND column_name IN ('room_id', 'superseded_by_invoice_id', 'duplicate_detected_at')
  `);

  const names = new Set(rows.map((r) => r.column_name));
  cache = {
    roomId: names.has('room_id'),
    supersededByInvoiceId: names.has('superseded_by_invoice_id'),
    duplicateDetectedAt: names.has('duplicate_detected_at'),
  };
  cacheAt = Date.now();
  return cache;
}

/** Test helper — force re-probe after migrations in the same process. */
export function resetElectricityInvoiceSchemaCapsCache(): void {
  cache = null;
  cacheAt = 0;
}
