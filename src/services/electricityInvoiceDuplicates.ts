/**
 * Detect and repair duplicate electricity invoices (same room + month + resident).
 * Backward compatible before migration 0087 (room_id / dedup columns on electricity_invoices).
 */
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  customers,
  electricityBills,
  electricityInvoices,
  rooms,
} from '@/src/db/schema';
import {
  getElectricityInvoiceSchemaCaps,
  type ElectricityInvoiceSchemaCaps,
} from '@/src/lib/db/electricityInvoiceSchemaCaps';
import {
  asElectricityInvoiceRow,
  electricityInvoiceLegacySelect,
} from '@/src/lib/db/electricityInvoiceSelect';
import { isProductionElectricityBillFilter } from '@/src/lib/billing/electricityProductionFilter';
import { firstOfMonth } from '@/src/services/billing';
import type { DateLike } from '@/src/lib/dates';

type DbExecutor = Pick<typeof db, 'select'>;

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

function supersededFilter(caps: ElectricityInvoiceSchemaCaps) {
  return caps.supersededByInvoiceId
    ? sql`AND ei.superseded_by_invoice_id IS NULL`
    : sql``;
}

function pipelineTestFilter() {
  return sql`AND COALESCE(ei.is_pipeline_test, false) = false`;
}

export async function countActiveElectricityInvoiceDuplicates(): Promise<number> {
  const caps = await getElectricityInvoiceSchemaCaps();

  const rows = caps.roomId
    ? await db.execute<{ group_count: number }>(sql`
        SELECT COUNT(*)::int AS group_count
        FROM (
          SELECT ei.room_id, ei.billing_month, ei.customer_id
          FROM electricity_invoices ei
          WHERE ei.status <> 'cancelled'
          ${supersededFilter(caps)}
          ${pipelineTestFilter()}
          GROUP BY ei.room_id, ei.billing_month, ei.customer_id
          HAVING COUNT(*) > 1
        ) dupes
      `)
    : await db.execute<{ group_count: number }>(sql`
        SELECT COUNT(*)::int AS group_count
        FROM (
          SELECT eb.room_id, ei.billing_month, ei.customer_id
          FROM electricity_invoices ei
          INNER JOIN electricity_bills eb ON eb.id = ei.electricity_bill_id
          WHERE ei.status <> 'cancelled'
          ${pipelineTestFilter()}
          GROUP BY eb.room_id, ei.billing_month, ei.customer_id
          HAVING COUNT(*) > 1
        ) dupes
      `);

  return rows[0]?.group_count ?? 0;
}

export async function listElectricityInvoiceDuplicateGroups(): Promise<
  ElectricityInvoiceDuplicateGroup[]
> {
  const caps = await getElectricityInvoiceSchemaCaps();

  const duplicateKeys = caps.roomId
    ? await db.execute<{
        room_id: string;
        billing_month: string;
        customer_id: string;
      }>(sql`
        SELECT ei.room_id, ei.billing_month::text, ei.customer_id
        FROM electricity_invoices ei
        WHERE ei.status <> 'cancelled'
        ${supersededFilter(caps)}
        ${pipelineTestFilter()}
        GROUP BY ei.room_id, ei.billing_month, ei.customer_id
        HAVING COUNT(*) > 1
        ORDER BY ei.billing_month DESC, ei.room_id
      `)
    : await db.execute<{
        room_id: string;
        billing_month: string;
        customer_id: string;
      }>(sql`
        SELECT eb.room_id, ei.billing_month::text, ei.customer_id
        FROM electricity_invoices ei
        INNER JOIN electricity_bills eb ON eb.id = ei.electricity_bill_id
        WHERE ei.status <> 'cancelled'
        GROUP BY eb.room_id, ei.billing_month, ei.customer_id
        HAVING COUNT(*) > 1
        ORDER BY ei.billing_month DESC, eb.room_id
      `);

  if (duplicateKeys.length === 0) return [];

  const groups: ElectricityInvoiceDuplicateGroup[] = [];

  for (const key of duplicateKeys) {
    const invoices = caps.roomId
      ? await db
          .select({
            invoiceId: electricityInvoices.id,
            invoiceNumber: electricityInvoices.invoiceNumber,
            status: electricityInvoices.status,
            amountPaise: electricityInvoices.amountPaise,
            paidPaise: electricityInvoices.paidPaise,
            bookingId: electricityInvoices.bookingId,
            billId: electricityInvoices.electricityBillId,
            createdAt: electricityInvoices.createdAt,
            duplicateDetectedAt: caps.duplicateDetectedAt
              ? electricityInvoices.duplicateDetectedAt
              : sql<Date | null>`NULL::timestamptz`,
            supersededByInvoiceId: caps.supersededByInvoiceId
              ? electricityInvoices.supersededByInvoiceId
              : sql<string | null>`NULL::uuid`,
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
              caps.supersededByInvoiceId
                ? isNull(electricityInvoices.supersededByInvoiceId)
                : undefined,
            ),
          )
          .orderBy(electricityInvoices.createdAt)
      : await db
          .select({
            invoiceId: electricityInvoices.id,
            invoiceNumber: electricityInvoices.invoiceNumber,
            status: electricityInvoices.status,
            amountPaise: electricityInvoices.amountPaise,
            paidPaise: electricityInvoices.paidPaise,
            bookingId: electricityInvoices.bookingId,
            billId: electricityInvoices.electricityBillId,
            createdAt: electricityInvoices.createdAt,
            duplicateDetectedAt: sql<Date | null>`NULL::timestamptz`,
            supersededByInvoiceId: sql<string | null>`NULL::uuid`,
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
          .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
          .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
          .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
          .where(
            and(
              eq(electricityBills.roomId, key.room_id),
              eq(electricityInvoices.billingMonth, key.billing_month),
              eq(electricityInvoices.customerId, key.customer_id),
              ne(electricityInvoices.status, 'cancelled'),
            ),
          )
          .orderBy(electricityInvoices.createdAt);

    if (invoices.length < 2) continue;

    const first = invoices[0]!;
    const groupKey = `${key.room_id}:${key.billing_month}:${key.customer_id}`;

    if (caps.duplicateDetectedAt) {
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
  /** Pass the active transaction to avoid pool deadlocks (max pool size 1 on Vercel). */
  executor?: DbExecutor;
}): Promise<{ id: string; invoiceNumber: string } | null> {
  const caps = await getElectricityInvoiceSchemaCaps();
  const billingMonth = firstOfMonth(input.billingMonth);
  const conn = input.executor ?? db;

  if (caps.roomId) {
    const [row] = await conn
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
          caps.supersededByInvoiceId
            ? isNull(electricityInvoices.supersededByInvoiceId)
            : undefined,
        ),
      )
      .orderBy(electricityInvoices.createdAt)
      .limit(1);
    return row ?? null;
  }

  const [row] = await conn
    .select({
      id: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .where(
      and(
        eq(electricityBills.roomId, input.roomId),
        eq(electricityInvoices.billingMonth, billingMonth),
        eq(electricityInvoices.customerId, input.customerId),
        ne(electricityInvoices.status, 'cancelled'),
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
  const caps = await getElectricityInvoiceSchemaCaps();
  if (!caps.supersededByInvoiceId) {
    return {
      ok: false,
      error:
        'Duplicate repair requires migration 0087 (superseded_by_invoice_id). Run database migrations first.',
    };
  }

  const [roomId, billingMonth, customerId] = input.groupKey.split(':');
  if (!roomId || !billingMonth || !customerId) {
    return { ok: false, error: 'Invalid duplicate group key.' };
  }

  const roomFilter = caps.roomId
    ? eq(electricityInvoices.roomId, roomId)
    : sql`${electricityBills.roomId} = ${roomId}`;

  const rows = caps.roomId
    ? await db
        .select(electricityInvoiceLegacySelect)
        .from(electricityInvoices)
        .where(
          and(
            roomFilter,
            eq(electricityInvoices.billingMonth, billingMonth),
            eq(electricityInvoices.customerId, customerId),
            ne(electricityInvoices.status, 'cancelled'),
            isNull(electricityInvoices.supersededByInvoiceId),
          ),
        )
        .then((r) => r.map((row) => asElectricityInvoiceRow(row)))
    : await db
        .select({ invoice: electricityInvoiceLegacySelect })
        .from(electricityInvoices)
        .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
        .where(
          and(
            eq(electricityBills.roomId, roomId),
            eq(electricityInvoices.billingMonth, billingMonth),
            eq(electricityInvoices.customerId, customerId),
            ne(electricityInvoices.status, 'cancelled'),
          ),
        )
        .then((r) => r.map((x) => asElectricityInvoiceRow(x.invoice)));

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

    if (caps.duplicateDetectedAt) {
      await tx
        .update(electricityInvoices)
        .set({ duplicateDetectedAt: null, updatedAt: new Date() })
        .where(eq(electricityInvoices.id, keeper.id));
    }
  });

  const { syncManyToUnified } = await import('@/src/services/unifiedInvoices');
  await syncManyToUnified([keeper.id, ...cancelledIds], 'electricity').catch(() => undefined);

  return { ok: true, cancelledIds };
}

/** Cancel pending invoices when the same booking + billing month already has a paid invoice. */
export async function cancelPendingElectricityWhenBookingMonthPaid(input?: {
  adminId?: string;
}): Promise<{ ok: true; cancelled: Array<{ invoiceId: string; invoiceNumber: string }> } | { ok: false; error: string }> {
  const pendingRows = await db
    .select({
      id: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      bookingId: electricityInvoices.bookingId,
      billingMonth: electricityInvoices.billingMonth,
      status: electricityInvoices.status,
      paidPaise: electricityInvoices.paidPaise,
    })
    .from(electricityInvoices)
    .where(
      and(
        eq(electricityInvoices.status, 'pending'),
        isNull(electricityInvoices.supersededByInvoiceId),
      ),
    );

  const paidRows = await db
    .select({
      bookingId: electricityInvoices.bookingId,
      billingMonth: electricityInvoices.billingMonth,
    })
    .from(electricityInvoices)
    .where(eq(electricityInvoices.status, 'paid'));

  const paidKeys = new Set(
    paidRows.map((r) => `${r.bookingId}:${String(r.billingMonth)}`),
  );

  const toCancel = pendingRows.filter(
    (row) =>
      paidKeys.has(`${row.bookingId}:${String(row.billingMonth)}`) && row.paidPaise === 0,
  );

  if (toCancel.length === 0) {
    return { ok: true, cancelled: [] };
  }

  const cancelled: Array<{ invoiceId: string; invoiceNumber: string }> = [];
  await db.transaction(async (tx) => {
    for (const inv of toCancel) {
      await tx
        .update(electricityInvoices)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(electricityInvoices.id, inv.id));
      cancelled.push({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber });
    }
  });

  const { syncManyToUnified } = await import('@/src/services/unifiedInvoices');
  await syncManyToUnified(
    cancelled.map((c) => c.invoiceId),
    'electricity',
  ).catch(() => undefined);

  if (input?.adminId) {
    const { writeAuditLogNonBlocking } = await import('@/src/lib/audit/writeAuditLog');
    await writeAuditLogNonBlocking(db, {
      actorType: 'admin',
      actorId: input.adminId,
      entity: 'electricity_invoice',
      entityId: cancelled.map((c) => c.invoiceId).join(','),
      action: 'cancel_duplicate_after_paid_month',
      diff: { cancelled },
    });
  }

  return { ok: true, cancelled };
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
    .where(
      and(
        eq(electricityBills.roomId, roomId),
        eq(electricityBills.billingMonth, month),
        isProductionElectricityBillFilter(),
      ),
    )
    .limit(1);
  return row ?? null;
}
