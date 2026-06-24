import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { actionItems, customers, pgs, residentRequests } from '@/src/db/schema';
import { formatPgDisplayName } from '@/src/lib/operationsCenterRules';

/** Sync open resident requests into action_items for Take Action + badges. */
export async function syncResidentRequestActionItems(): Promise<void> {
  const rows = await db
    .select({
      id: residentRequests.id,
      type: residentRequests.type,
      status: residentRequests.status,
      amountPaise: residentRequests.amountPaise,
      requestedEndDate: residentRequests.requestedEndDate,
      pgId: residentRequests.pgId,
      residentId: residentRequests.customerId,
      bookingId: residentRequests.bookingId,
      pgName: pgs.name,
      residentName: customers.fullName,
    })
    .from(residentRequests)
    .innerJoin(pgs, eq(pgs.id, residentRequests.pgId))
    .innerJoin(customers, eq(customers.id, residentRequests.customerId))
    .where(
      or(
        and(
          inArray(residentRequests.type, ['stay_extension', 'deposit_due_extension']),
          inArray(residentRequests.status, ['submitted', 'under_review']),
        ),
        and(
          eq(residentRequests.type, 'deposit_refund'),
          inArray(residentRequests.status, ['submitted', 'under_review', 'approved']),
        ),
      ),
    );

  const openKeys = new Set<string>();

  for (const row of rows) {
    const type =
      row.type === 'deposit_refund'
        ? row.status === 'submitted'
          ? 'refund_request_submitted'
          : 'deposit_refund_request'
        : row.type === 'deposit_due_extension'
          ? 'extension_request'
          : 'extension_request';
    const sourceKey = `resident_request:${row.id}`;
    openKeys.add(sourceKey);

    const title =
      row.type === 'deposit_refund'
        ? `Deposit refund — ${row.residentName ?? 'Resident'}`
        : row.type === 'deposit_due_extension'
          ? `Deposit due extension — ${row.residentName ?? 'Resident'} to ${row.requestedEndDate ?? '?'}`
          : `Stay extension — ${row.residentName ?? 'Resident'} until ${row.requestedEndDate ?? '?'}`;

    await db
      .insert(actionItems)
      .values({
        type,
        title,
        pgId: row.pgId,
        residentId: row.residentId,
        amount: row.amountPaise,
        dueDate: row.requestedEndDate,
        priority: row.status === 'submitted' ? 'high' : 'medium',
        sourceKey,
        metadata: {
          residentName: row.residentName ?? undefined,
          pgName: formatPgDisplayName(row.pgName),
          bookingId: row.bookingId,
          requestId: row.id,
          requestStatus: row.status,
        },
        status: 'open',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: actionItems.sourceKey,
        set: {
          title,
          amount: row.amountPaise,
          dueDate: row.requestedEndDate,
          priority: row.status === 'submitted' ? 'high' : 'medium',
          metadata: {
            residentName: row.residentName ?? undefined,
            pgName: formatPgDisplayName(row.pgName),
            bookingId: row.bookingId,
            requestId: row.id,
            requestStatus: row.status,
          },
          updatedAt: new Date(),
        },
        where: sql`${actionItems.status} != 'resolved'`,
      });
  }

  const resolved = await db
    .select({ sourceKey: actionItems.sourceKey })
    .from(actionItems)
    .where(
      and(
        inArray(actionItems.type, [
          'deposit_refund_request',
          'refund_request_submitted',
          'extension_request',
        ]),
        inArray(actionItems.status, ['open', 'in_progress']),
      ),
    );

  for (const item of resolved) {
    if (!openKeys.has(item.sourceKey)) {
      await db
        .update(actionItems)
        .set({ status: 'resolved', updatedAt: new Date() })
        .where(eq(actionItems.sourceKey, item.sourceKey));
    }
  }

  /** Checkout settlements own vacating refunds — clear stale legacy resident-request badges. */
  await db.execute(sql`
    UPDATE action_items ai
    SET status = 'resolved', updated_at = now()
    WHERE ai.type IN ('refund_request_submitted', 'deposit_refund_request')
      AND ai.status IN ('open', 'in_progress')
      AND EXISTS (
        SELECT 1 FROM checkout_settlements cs
        WHERE cs.booking_id::text = ai.metadata->>'bookingId'
          AND cs.status NOT IN ('archived', 'completed', 'refund_paid')
      )
  `);
}
