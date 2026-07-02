import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { operationsQueueDismissals } from '@/src/db/schema';
import type { ResidentOpsQueueCategory } from '@/src/lib/residents/residentOperationsDashboard';

export type OperationsQueueDismissalIndex = {
  customerIds: Set<string>;
  bookingIds: Set<string>;
  vacatingIds: Set<string>;
  settlementIds: Set<string>;
};

export type RecordOperationsQueueDismissalInput = {
  adminId: string;
  queueItemId: string;
  category: ResidentOpsQueueCategory;
  customerId: string;
  bookingId: string | null;
  vacatingRequestId: string | null;
  settlementId: string | null;
};

const EMPTY_INDEX: OperationsQueueDismissalIndex = {
  customerIds: new Set(),
  bookingIds: new Set(),
  vacatingIds: new Set(),
  settlementIds: new Set(),
};

export function parseDomainIdsFromQueueItemId(queueItemId: string): {
  vacatingRequestId: string | null;
  settlementId: string | null;
  bookingId: string | null;
} {
  if (queueItemId.startsWith('moveout-')) {
    return {
      vacatingRequestId: queueItemId.slice('moveout-'.length) || null,
      settlementId: null,
      bookingId: null,
    };
  }
  if (queueItemId.startsWith('checkout-refund-')) {
    return {
      vacatingRequestId: null,
      settlementId: queueItemId.slice('checkout-refund-'.length) || null,
      bookingId: null,
    };
  }
  if (queueItemId.startsWith('blocked-refund-')) {
    return {
      vacatingRequestId: null,
      settlementId: queueItemId.slice('blocked-refund-'.length) || null,
      bookingId: null,
    };
  }
  if (queueItemId.startsWith('deposit-refund-')) {
    return {
      vacatingRequestId: null,
      settlementId: null,
      bookingId: queueItemId.slice('deposit-refund-'.length) || null,
    };
  }
  if (queueItemId.startsWith('deposit-')) {
    return {
      vacatingRequestId: null,
      settlementId: null,
      bookingId: queueItemId.slice('deposit-'.length) || null,
    };
  }
  return { vacatingRequestId: null, settlementId: null, bookingId: null };
}

export async function loadOperationsQueueDismissalIndex(): Promise<OperationsQueueDismissalIndex> {
  const rows = await db
    .select({
      customerId: operationsQueueDismissals.customerId,
      bookingId: operationsQueueDismissals.bookingId,
      vacatingRequestId: operationsQueueDismissals.vacatingRequestId,
      settlementId: operationsQueueDismissals.settlementId,
    })
    .from(operationsQueueDismissals);

  if (rows.length === 0) return EMPTY_INDEX;

  const index: OperationsQueueDismissalIndex = {
    customerIds: new Set(),
    bookingIds: new Set(),
    vacatingIds: new Set(),
    settlementIds: new Set(),
  };

  for (const row of rows) {
    index.customerIds.add(row.customerId);
    if (row.bookingId) index.bookingIds.add(row.bookingId);
    if (row.vacatingRequestId) index.vacatingIds.add(row.vacatingRequestId);
    if (row.settlementId) index.settlementIds.add(row.settlementId);
  }

  return index;
}

export function isDismissedFromOperationsQueue(
  index: OperationsQueueDismissalIndex,
  input: {
    customerId?: string | null;
    bookingId?: string | null;
    vacatingRequestId?: string | null;
    settlementId?: string | null;
  },
): boolean {
  if (input.settlementId && index.settlementIds.has(input.settlementId)) return true;
  if (input.vacatingRequestId && index.vacatingIds.has(input.vacatingRequestId)) return true;
  if (input.bookingId && index.bookingIds.has(input.bookingId)) return true;
  if (input.customerId && index.customerIds.has(input.customerId)) return true;
  return false;
}

export async function recordOperationsQueueDismissal(
  input: RecordOperationsQueueDismissalInput,
): Promise<void> {
  await db
    .insert(operationsQueueDismissals)
    .values({
      customerId: input.customerId,
      bookingId: input.bookingId,
      vacatingRequestId: input.vacatingRequestId,
      settlementId: input.settlementId,
      queueItemId: input.queueItemId,
      category: input.category,
      dismissedBy: input.adminId,
    })
    .onConflictDoNothing({ target: operationsQueueDismissals.queueItemId });
}

export type OperationsQueueSourceAudit = {
  resident_id: string | null;
  booking_id: string | null;
  vacating_request_id: string | null;
  checkout_settlement_id: string | null;
  action_items_count: number;
  unresolved_actions_count: number;
  notifications_count: number;
  queue_sources: string[];
};

/** Production audit helper — which domain queries still surface a resident. */
export async function auditOperationsQueueSourcesForResident(
  residentNameOrPhone: string,
): Promise<OperationsQueueSourceAudit | null> {
  const [customer] = await db.execute<{
    id: string;
    full_name: string;
    phone: string;
  }>(sql`
    SELECT id, full_name, phone FROM customers
    WHERE full_name ILIKE ${'%' + residentNameOrPhone + '%'}
       OR phone ILIKE ${'%' + residentNameOrPhone + '%'}
    LIMIT 1
  `);
  if (!customer) return null;

  const residentId = String(customer.id);

  const [booking] = await db.execute<{ id: string }>(sql`
    SELECT b.id FROM bookings b
    WHERE b.customer_id = ${residentId}::uuid
    ORDER BY b.updated_at DESC
    LIMIT 1
  `);
  const bookingId = booking ? String(booking.id) : null;

  const [vacating] = await db.execute<{ id: string }>(sql`
    SELECT id FROM vacating_requests
    WHERE customer_id = ${residentId}::uuid
      AND status IN ('pending', 'approved')
    ORDER BY updated_at DESC
    LIMIT 1
  `);
  const vacatingRequestId = vacating ? String(vacating.id) : null;

  const [settlement] = await db.execute<{ id: string; status: string; final_refund_paise: number | null }>(sql`
    SELECT id, status, final_refund_paise FROM checkout_settlements
    WHERE customer_id = ${residentId}::uuid
      AND status <> 'archived'
    ORDER BY updated_at DESC
    LIMIT 1
  `);
  const checkoutSettlementId = settlement ? String(settlement.id) : null;

  const [actionCounts] = await db.execute<{ c: number }>(sql`
    SELECT COUNT(*)::int AS c FROM action_items
    WHERE resident_id = ${residentId}::uuid
      AND status IN ('open', 'in_progress')
  `);

  const [unresolvedCounts] = await db.execute<{ c: number }>(sql`
    SELECT COUNT(*)::int AS c FROM unresolved_actions
    WHERE resident_id = ${residentId}::uuid
      AND status = 'OPEN'
  `);

  const [notifCounts] = await db.execute<{ c: number }>(sql`
    SELECT COUNT(*)::int AS c
    FROM admin_notifications n
    INNER JOIN admin_notification_states s ON s.notification_id = n.id
    WHERE n.resident_id = ${residentId}::uuid
      AND s.state = 'active'
  `);

  const queueSources: string[] = [];

  if (vacatingRequestId) {
    queueSources.push('vacating_requests (pending/approved)');
  }

  if (
    settlement &&
    String(settlement.status) === 'refund_pending' &&
    Number(settlement.final_refund_paise ?? 0) > 0
  ) {
    queueSources.push('checkout_settlements (refund_pending, refund > 0)');
  } else if (
    settlement &&
    String(settlement.status) === 'refund_pending' &&
    Number(settlement.final_refund_paise ?? 0) <= 0
  ) {
    queueSources.push('checkout_settlements (stale refund_pending, ₹0)');
  }

  if (bookingId) {
    const [depositPending] = await db.execute<{ c: number }>(sql`
      SELECT COUNT(*)::int AS c FROM bookings
      WHERE id = ${bookingId}::uuid
        AND admin_deposit_refund_status = 'pending'
        AND status = 'completed'
    `);
    if (Number(depositPending?.c ?? 0) > 0) {
      queueSources.push('bookings.admin_deposit_refund_status = pending');
    }
  }

  const [dismissed] = await db.execute<{ c: number }>(sql`
    SELECT COUNT(*)::int AS c FROM operations_queue_dismissals
    WHERE customer_id = ${residentId}::uuid
  `);
  if (Number(dismissed?.c ?? 0) > 0) {
    queueSources.push(`operations_queue_dismissals (${dismissed?.c} rows — filtered from queue)`);
  }

  return {
    resident_id: residentId,
    booking_id: bookingId,
    vacating_request_id: vacatingRequestId,
    checkout_settlement_id: checkoutSettlementId,
    action_items_count: Number(actionCounts?.c ?? 0),
    unresolved_actions_count: Number(unresolvedCounts?.c ?? 0),
    notifications_count: Number(notifCounts?.c ?? 0),
    queue_sources: queueSources,
  };
}
