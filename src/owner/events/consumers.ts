/**
 * Ecosystem event consumers — durable inbox only in Phase 1.
 * No fake events; callers may enqueue real payloads when emitters exist.
 */
import { desc, eq, isNull } from 'drizzle-orm';
import { ownerDb } from '@/src/owner/db/client';
import { ooEventInbox } from '@/src/owner/db/schema';

export const OWNER_OS_EVENT_TYPES = [
  'rent.paid',
  'deposit.collected',
  'salon.invoice.paid',
  'vehicle.sold',
  'vehicle.cost.recorded',
  'employee.finance.contribution',
] as const;

export type OwnerOsEventType = (typeof OWNER_OS_EVENT_TYPES)[number];

export async function enqueueOwnerOsEvent(input: {
  eventType: OwnerOsEventType | string;
  sourceEngine: string;
  sourceBrain?: string | null;
  payload?: Record<string, unknown>;
}): Promise<string> {
  const [row] = await ownerDb
    .insert(ooEventInbox)
    .values({
      eventType: input.eventType,
      sourceEngine: input.sourceEngine,
      sourceBrain: input.sourceBrain ?? null,
      payload: JSON.stringify(input.payload ?? {}),
    })
    .returning({ id: ooEventInbox.id });
  return row.id;
}

export async function listUnprocessedOwnerOsEvents(limit = 50) {
  return ownerDb
    .select()
    .from(ooEventInbox)
    .where(isNull(ooEventInbox.processedAt))
    .orderBy(desc(ooEventInbox.createdAt))
    .limit(limit);
}

export async function markOwnerOsEventProcessed(id: string): Promise<void> {
  await ownerDb
    .update(ooEventInbox)
    .set({ processedAt: new Date() })
    .where(eq(ooEventInbox.id, id));
}

/**
 * Phase 1 processor: acknowledge known types without inventing balances.
 * Recalculation happens by re-reading Personal Finance / Engine APIs on dashboard load.
 */
export async function processOwnerOsEventInbox(limit = 20): Promise<{ processed: number }> {
  const rows = await listUnprocessedOwnerOsEvents(limit);
  let processed = 0;
  for (const row of rows) {
    // Intentionally no duplicate math — dashboard refreshes from live Brain APIs.
    await markOwnerOsEventProcessed(row.id);
    processed += 1;
  }
  return { processed };
}
