/**
 * Detect and repair duplicate electricity invoices (same room + month + resident).
 */
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  customers,
  electricityBills,
  electricityInvoices,
  rooms,
} from '@/src/db/schema';
import { firstOfMonth } from '@/src/services/billing';
import type { DateLike } from '@/src/lib/dates';

export type ElectricityInvoiceDuplicateRow = {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  amountPaise: number;
  paidPaise: number;
  bookingId: string;
  billId: string;
  createdAt: Date;
  duplicateDetectedAt: Date | null;
  supersededByInvoiceId: string | null;
};

export type ElectricityInvoiceDuplicateGroup = {
  groupKey: string;
  roomId: string;
  roomNumber: string;
  pgName: string;
  billingMonth: string;
  customerId: string;
  customerName: string;
  invoices: ElectricityInvoiceDuplicateRow[];
};

export async function countActiveElectricityInvoiceDuplicates(): Promise<number> {
  const rows = await db.execute<{ group_count: number }>(sql`
    SELECT COUNT(*)::int AS group_count
    FROM (
      SELECT ei.room_id, ei.billing_month, ei.customer_id
      FROM electricity_invoices ei
      WHERE ei.status <> 'cancelled'
        AND ei.superseded_by_invoice_id IS NULL
      GROUP BY ei.room_id, ei.billing_month, ei.customer_id
      HAVING COUNT(*) > 1
    ) dupes
  `);
  return rows[0]?.group_count ?? 0;
}

export async function listElectricityInvoiceDuplicateGroups(): Promise<
  ElectricityInvoiceDuplicateGroup[]
> {
  const duplicateKeys = await db.execute<{
    room_id: string;
    billing_month: string;
    customer_id: string;
  }>(sql`
    SELECT ei.room_id, ei.billing_month::text, ei.customer_id
    FROM electricity_invoices ei
    WHERE ei.status <> 'cancelled'
      AND ei.superseded_by_invoice_id IS NULL
    GROUP BY ei.room_id, ei.billing_month, ei.customer_id
    HAVING COUNT(*) > 1
    ORDER BY ei.billing_month DESC, ei.room_id
  `);

  if (duplicateKeys.length === 0) return [];

  const groups: ElectricityInvoiceDuplicateGroup[] = [];

  for (const key of duplicateKeys) {
    const invoices = await db
      .select({
        invoiceId: electricityInvoices.id,
        invoiceNumber: electricityInvoices.invoiceNumber,
        status: electricityInvoices.status,
        amountPaise: electricityInvoices.amountPaise,
        paidPaise: electricityInvoices.paidPaise,
        bookingId: electricityInvoices.bookingId,
        billId: electricityInvoices.electricityBillId,
        createdAt: electricityInvoices.createdAt,
        duplicateDetectedAt: electricityInvoices.duplicateDetectedAt,
        supersededByInvoiceId: electricityInvoices.supersededByInvoiceId,
        roomNumber: rooms.roomNumber,
        pgName: sql<string>`(
          SELECT p.name FROM pgs p
          INNER JOIN floors f ON f.pg_id = p.id
          WHERE f.id = ${rooms.floorId}
          LIMIT 1
        )`,
        customerName: customers.fullName,
      })
      .from(electricityInvoices)
      .innerJoin(rooms, eq(rooms.id, electricityInvoices.roomId))
      .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
      .where(
        and(
          eq(electricityInvoices.roomId, key.room_id),
          eq(electricityInvoices.billingMonth, key.billing_month),
          eq(electricityInvoices.customerId, key.customer_id),
          ne(electricityInvoices.status, 'cancelled'),
          isNull(electricityInvoices.supersededByInvoiceId),
        ),
      )
      .orderBy(electricityInvoices.createdAt);

    if (invoices.length < 2) continue;

    const first = invoices[0]!;
    const groupKey = `${key.room_id}:${key.billing_month}:${key.customer_id}`;

    const undetected = invoices.filter((i) => !i.duplicateDetectedAt);
    if (undetected.length > 0) {
      await db
        .update(electricityInvoices)
        .set({ duplicateDetectedAt: new Date(), updatedAt: new Date() })
        .where(
          inArray(
            electricityInvoices.id,
            undetected.map((i) => i.invoiceId),
          ),
        );
    }

    groups.push({
      groupKey,
      roomId: key.room_id,
      roomNumber: first.roomNumber,
      pgName: first.pgName,
      billingMonth: key.billing_month,
      customerId: key.customer_id,
      customerName: first.customerName,
      invoices: invoices.map((i) => ({
        invoiceId: i.invoiceId,
        invoiceNumber: i.invoiceNumber,
        status: i.status,
        amountPaise: i.amountPaise,
        paidPaise: i.paidPaise,
        bookingId: i.bookingId,
        billId: i.billId,
        createdAt: i.createdAt,
        duplicateDetectedAt: i.duplicateDetectedAt,
        supersededByInvoiceId: i.supersededByInvoiceId,
      })),
    });
  }

  return groups;
}

export async function findActiveElectricityInvoiceForResidentMonth(input: {
  roomId: string;
  billingMonth: DateLike;
  customerId: string;
}): Promise<{ id: string; invoiceNumber: string } | null> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const [row] = await db
    .select({
      id: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
    })
    .from(electricityInvoices)
    .where(
      and(
        eq(electricityInvoices.roomId, input.roomId),
        eq(electricityInvoices.billingMonth, billingMonth),
        eq(electricityInvoices.customerId, input.customerId),
        ne(electricityInvoices.status, 'cancelled'),
        isNull(electricityInvoices.supersededByInvoiceId),
      ),
    )
    .orderBy(electricityInvoices.createdAt)
    .limit(1);
  return row ?? null;
}

export async function repairElectricityInvoiceDuplicateGroup(input: {
  keepInvoiceId: string;
  groupKey: string;
  adminId: string;
}): Promise<{ ok: true; cancelledIds: string[] } | { ok: false; error: string }> {
  const [roomId, billingMonth, customerId] = input.groupKey.split(':');
  if (!roomId || !billingMonth || !customerId) {
    return { ok: false, error: 'Invalid duplicate group key.' };
  }

  const rows = await db
    .select()
    .from(electricityInvoices)
    .where(
      and(
        eq(electricityInvoices.roomId, roomId),
        eq(electricityInvoices.billingMonth, billingMonth),
        eq(electricityInvoices.customerId, customerId),
        ne(electricityInvoices.status, 'cancelled'),
        isNull(electricityInvoices.supersededByInvoiceId),
      ),
    );

  if (rows.length < 2) {
    return { ok: false, error: 'This duplicate group no longer exists.' };
  }

  const keeper = rows.find((r) => r.id === input.keepInvoiceId);
  if (!keeper) {
    return { ok: false, error: 'Selected invoice is not in this duplicate group.' };
  }

  const toCancel = rows.filter((r) => r.id !== input.keepInvoiceId);
  const paidToCancel = toCancel.filter((r) => r.status === 'paid' || r.paidPaise > 0);
  if (paidToCancel.length > 0) {
    return {
      ok: false,
      error:
        'Cannot cancel invoices that already have payments. Pick the paid invoice to keep, or resolve payments first.',
    };
  }

  const cancelledIds: string[] = [];
  await db.transaction(async (tx) => {
    for (const inv of toCancel) {
      await tx
        .update(electricityInvoices)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          supersededByInvoiceId: keeper.id,
          updatedAt: new Date(),
        })
        .where(eq(electricityInvoices.id, inv.id));
      cancelledIds.push(inv.id);
    }

    await tx
      .update(electricityInvoices)
      .set({ duplicateDetectedAt: null, updatedAt: new Date() })
      .where(eq(electricityInvoices.id, keeper.id));
  });

  const { syncManyToUnified } = await import('@/src/services/unifiedInvoices');
  await syncManyToUnified([keeper.id, ...cancelledIds], 'electricity').catch(() => undefined);

  return { ok: true, cancelledIds };
}

/** Verify bill exists for room+month (used by generation idempotency). */
export async function findExistingElectricityBillForRoomMonth(
  roomId: string,
  billingMonth: DateLike,
): Promise<{ id: string } | null> {
  const month = firstOfMonth(billingMonth);
  const [row] = await db
    .select({ id: electricityBills.id })
    .from(electricityBills)
    .where(and(eq(electricityBills.roomId, roomId), eq(electricityBills.billingMonth, month)))
    .limit(1);
  return row ?? null;
}
