/**
 * Action items for fixed-stay checkout expiry — upsert + resolve on settlement progress.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { actionItems } from '@/src/db/schema';
import { formatPgDisplayName } from '@/src/lib/operationsCenterRules';

export async function upsertFixedStayCheckoutActionItem(input: {
  bookingId: string;
  bookingCode: string;
  pgId: string;
  pgName: string;
  roomId: string;
  bedId: string;
  roomNumber: string;
  bedCode: string;
  residentId: string;
  residentName: string;
  checkoutDate: string;
  settlementId: string | null;
  depositPaise: number;
}): Promise<void> {
  const sourceKey = `fixed_stay_checkout:${input.bookingId}`;
  await db
    .insert(actionItems)
    .values({
      type: 'fixed_stay_checkout_due',
      title: `${input.residentName} · Fixed stay checkout · ${input.bookingCode}`,
      pgId: input.pgId,
      roomId: input.roomId,
      bedId: input.bedId,
      residentId: input.residentId,
      amount: input.depositPaise > 0 ? input.depositPaise : null,
      dueDate: input.checkoutDate,
      priority: 'high',
      sourceKey,
      metadata: {
        residentName: input.residentName,
        pgName: formatPgDisplayName(input.pgName),
        roomNumber: input.roomNumber,
        bedCode: input.bedCode,
        bookingId: input.bookingId,
        settlementId: input.settlementId ?? undefined,
      },
      status: 'open',
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: actionItems.sourceKey,
      set: {
        title: `${input.residentName} · Fixed stay checkout · ${input.bookingCode}`,
        amount: input.depositPaise > 0 ? input.depositPaise : null,
        dueDate: input.checkoutDate,
        priority: 'high',
        metadata: {
          residentName: input.residentName,
          pgName: formatPgDisplayName(input.pgName),
          roomNumber: input.roomNumber,
          bedCode: input.bedCode,
          bookingId: input.bookingId,
          settlementId: input.settlementId ?? undefined,
        },
        updatedAt: new Date(),
      },
      where: sql`${actionItems.status} != 'resolved'`,
    });
}

/** Resolve fixed-stay checkout tasks when settlement advances past resident-details stage. */
export async function resolveFixedStayCheckoutActionItems(): Promise<{ resolved: number }> {
  const rows = await db.execute<{ id: string }>(sql`
    UPDATE action_items ai
    SET status = 'resolved', updated_at = now()
    WHERE ai.type = 'fixed_stay_checkout_due'
      AND ai.status IN ('open', 'in_progress')
      AND EXISTS (
        SELECT 1 FROM checkout_settlements cs
        WHERE ai.source_key = 'fixed_stay_checkout:' || cs.booking_id::text
          AND cs.status NOT IN ('awaiting_resident_details', 'archived')
      )
    RETURNING ai.id
  `);
  return { resolved: rows.length };
}

export async function resolveFixedStayCheckoutForBooking(bookingId: string): Promise<void> {
  await db
    .update(actionItems)
    .set({ status: 'resolved', updatedAt: new Date() })
    .where(
      and(
        eq(actionItems.sourceKey, `fixed_stay_checkout:${bookingId}`),
        inArray(actionItems.status, ['open', 'in_progress']),
      ),
    );
}
