/**
 * Read-only outbox event counts for a property billing month window.
 */

import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { roomOsOutbox } from '@/src/db/schema/roomOsOutbox';
import type { EventMetricsRollup } from '@/src/roomOs/types';
import { firstOfMonth } from '@/src/services/billing';

function nextMonthStart(billingMonth: string): string {
  const d = new Date(firstOfMonth(billingMonth));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export async function aggregateEventMetrics(input: {
  pgId: string;
  billingMonth: string;
}): Promise<EventMetricsRollup> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const monthEnd = nextMonthStart(billingMonth);

  const rows = await db
    .select({
      eventType: roomOsOutbox.eventType,
      count: sql<number>`count(*)::int`,
    })
    .from(roomOsOutbox)
    .where(
      and(
        eq(roomOsOutbox.streamType, 'property'),
        eq(roomOsOutbox.streamId, input.pgId),
        gte(roomOsOutbox.occurredAt, new Date(`${billingMonth}T00:00:00.000Z`)),
        lt(roomOsOutbox.occurredAt, new Date(`${monthEnd}T00:00:00.000Z`)),
      ),
    )
    .groupBy(roomOsOutbox.eventType);

  const countsByType: Record<string, number> = {};
  let totalEvents = 0;
  for (const row of rows) {
    countsByType[row.eventType] = row.count;
    totalEvents += row.count;
  }

  return {
    billingMonth,
    countsByType,
    totalEvents,
  };
}
