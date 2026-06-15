import { and, eq, inArray, sql } from 'drizzle-orm';
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
    .where(inArray(residentRequests.status, ['submitted', 'under_review', 'approved']));

  const openKeys = new Set<string>();

  for (const row of rows) {
    const type =
      row.type === 'deposit_refund' ? 'deposit_refund_request' : 'extension_request';
    const sourceKey = `resident_request:${row.id}`;
    openKeys.add(sourceKey);

    const title =
      row.type === 'deposit_refund'
        ? `Deposit refund — ${row.residentName ?? 'Resident'}`
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
        inArray(actionItems.type, ['deposit_refund_request', 'extension_request']),
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
}
