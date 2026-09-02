import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import * as schema from '@/src/db/schema';
import {
  customers,
  roomChangeEvents,
  roomChangeRequests,
} from '@/src/db/schema';
import { sendEmail } from '@/src/lib/email/send';

export type RoomChangeEventType =
  | 'held'
  | 'payment_required'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'failed';

type RoomChangeDb = PostgresJsDatabase<typeof schema>;

export async function appendRoomChangeEvent(
  tx: RoomChangeDb,
  input: {
    requestId: string;
    eventType: RoomChangeEventType;
    idempotencyKey: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await tx
    .insert(roomChangeEvents)
    .values({
      roomChangeRequestId: input.requestId,
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload ?? {},
    })
    .onConflictDoNothing({ target: roomChangeEvents.idempotencyKey });
}

type ClaimedEvent = {
  id: string;
  room_change_request_id: string;
  event_type: RoomChangeEventType;
  payload: Record<string, unknown>;
  attempt_count: number;
};

function eventCopy(
  eventType: RoomChangeEventType,
  payload: Record<string, unknown>,
): { subject: string; text: string } {
  const expiresAt = typeof payload.expiresAt === 'string' ? payload.expiresAt : null;
  const copy: Record<RoomChangeEventType, { subject: string; text: string }> = {
    held: {
      subject: 'Your target bed is reserved',
      text: `Your room-change target bed is reserved${expiresAt ? ` until ${expiresAt}` : ' for 72 hours'}.`,
    },
    payment_required: {
      subject: 'Payment required for your room change',
      text: 'Complete the listed room-change payments within 72 hours. The transfer will run automatically after settlement.',
    },
    ready: {
      subject: 'Your room change is ready',
      text: 'All required charges are settled. Your transfer will complete automatically on the effective date.',
    },
    completed: {
      subject: 'Your room change is complete',
      text: 'Your new bed is active and the previous bed has been released.',
    },
    cancelled: {
      subject: 'Your room change was cancelled',
      text: 'The target-bed hold has been released. Paid financial history, if any, remains recorded.',
    },
    expired: {
      subject: 'Your room-change hold expired',
      text: 'The 72-hour payment window ended and the target bed was released.',
    },
    failed: {
      subject: 'Your room change needs attention',
      text: 'The transfer could not continue safely. Operations has been alerted; your current bed remains unchanged.',
    },
  };
  return copy[eventType];
}

export async function processRoomChangeEvents(limit = 50): Promise<{
  processed: number;
  failed: number;
}> {
  const events = await db.execute<ClaimedEvent>(sql`
    WITH claimed AS (
      SELECT id
      FROM room_change_events
      WHERE (
        status = 'pending'
        OR (status = 'failed' AND next_retry_at <= now() AND attempt_count < 8)
      )
      ORDER BY created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE room_change_events event
    SET status = 'processing',
        attempt_count = event.attempt_count + 1
    FROM claimed
    WHERE event.id = claimed.id
    RETURNING event.id,
              event.room_change_request_id,
              event.event_type,
              event.payload,
              event.attempt_count
  `);

  let processed = 0;
  let failed = 0;
  for (const event of events) {
    const [recipient] = await db
      .select({ email: customers.email, name: customers.fullName })
      .from(roomChangeRequests)
      .innerJoin(customers, eq(customers.id, roomChangeRequests.customerId))
      .where(eq(roomChangeRequests.id, event.room_change_request_id))
      .limit(1);
    if (!recipient?.email) {
      await db
        .update(roomChangeEvents)
        .set({ status: 'processed', processedAt: new Date() })
        .where(eq(roomChangeEvents.id, event.id));
      processed += 1;
      continue;
    }

    const copy = eventCopy(event.event_type, event.payload ?? {});
    const result = await sendEmail({
      to: recipient.email,
      subject: copy.subject,
      text: `Hi ${recipient.name},\n\n${copy.text}\n\nAwesome PG`,
    });
    if (result.ok) {
      await db
        .update(roomChangeEvents)
        .set({ status: 'processed', processedAt: new Date(), nextRetryAt: null })
        .where(eq(roomChangeEvents.id, event.id));
      processed += 1;
    } else {
      const retryMinutes = Math.min(360, 5 * 2 ** Math.max(0, event.attempt_count - 1));
      await db
        .update(roomChangeEvents)
        .set({
          status: 'failed',
          nextRetryAt: new Date(Date.now() + retryMinutes * 60_000),
        })
        .where(and(eq(roomChangeEvents.id, event.id), eq(roomChangeEvents.status, 'processing')));
      failed += 1;
    }
  }
  return { processed, failed };
}
