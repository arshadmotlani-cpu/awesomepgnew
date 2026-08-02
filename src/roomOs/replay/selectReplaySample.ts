/**
 * Read-only replay sample selection from processed outbox events.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { roomOsOutbox } from '@/src/db/schema/roomOsOutbox';
import { toRoomOsEventEnvelope } from '@/src/roomOs/outbox/append';
import type { RoomOsEventEnvelope } from '@/src/roomOs/types';
import { firstOfMonth } from '@/src/services/billing';
import { todayString } from '@/src/lib/dates';

export async function selectReplaySample(input: {
  pgId: string;
  billingMonth?: string;
  sampleSize?: number;
}): Promise<RoomOsEventEnvelope[]> {
  const billingMonth = firstOfMonth(input.billingMonth ?? todayString());
  const limit = input.sampleSize ?? 5;

  const rows = await db
    .select()
    .from(roomOsOutbox)
    .where(
      and(
        eq(roomOsOutbox.streamType, 'property'),
        eq(roomOsOutbox.streamId, input.pgId),
        eq(roomOsOutbox.status, 'processed'),
        eq(roomOsOutbox.eventType, 'property_index.rebuild_requested'),
        sql`${roomOsOutbox.payload}->>'billingMonth' = ${billingMonth}`,
      ),
    )
    .orderBy(desc(roomOsOutbox.processedAt))
    .limit(limit);

  return rows.map((row) => toRoomOsEventEnvelope(row));
}
