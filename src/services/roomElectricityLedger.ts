/**
 * Room electricity ledger — per-room per-billing-cycle SSOT for collected vs remaining.
 * Works alongside electricity_settlement_ledger (billing integration).
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  checkoutSettlements,
  customers,
  electricityBills,
  electricitySettlementLedger,
  roomElectricityLedgerCycles,
  roomElectricityLedgerEntries,
  vacatingRequests,
  type CheckoutSettlement,
} from '@/src/db/schema';
import { resolveCheckoutElectricityDeductionPaise } from '@/src/lib/checkout/electricitySettlementCalc';
import { firstOfMonth } from '@/src/services/billing';
import type { DateLike } from '@/src/lib/dates';
import { formatBillingMonthLabel } from '@/src/lib/billing/formatBillingMonth';

export { formatBillingMonthLabel };

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type RoomElectricityLedgerEntryView = {
  customerId: string;
  customerName: string;
  bookingId: string;
  amountPaise: number;
  source: string;
  collectedAt: Date;
};

export type RoomElectricityLedgerCycleView = {
  billingMonth: string;
  totalBillPaise: number;
  collectedPaise: number;
  remainingPaise: number;
  entries: RoomElectricityLedgerEntryView[];
};

async function resolveRoomMonthlyBillPaise(
  roomId: string,
  billingMonth: string,
  fallbackTotalPaise?: number,
): Promise<number> {
  const [bill] = await db
    .select({ totalPaise: electricityBills.totalPaise })
    .from(electricityBills)
    .where(
      and(
        eq(electricityBills.roomId, roomId),
        eq(electricityBills.billingMonth, billingMonth),
      ),
    )
    .limit(1);
  if (bill?.totalPaise != null && bill.totalPaise > 0) return bill.totalPaise;
  return Math.max(0, fallbackTotalPaise ?? 0);
}

async function recalculateCycleTotalsInTx(
  tx: DbTx,
  cycleId: string,
  totalBillPaise: number,
): Promise<{ collectedPaise: number; remainingPaise: number }> {
  const [sumRow] = await tx
    .select({
      total: sql<number>`coalesce(sum(${roomElectricityLedgerEntries.amountPaise}), 0)::bigint::int`,
    })
    .from(roomElectricityLedgerEntries)
    .where(eq(roomElectricityLedgerEntries.cycleId, cycleId));

  const collectedPaise = Math.min(sumRow?.total ?? 0, totalBillPaise);
  const remainingPaise = Math.max(0, totalBillPaise - collectedPaise);

  await tx
    .update(roomElectricityLedgerCycles)
    .set({
      totalBillPaise,
      collectedPaise,
      remainingPaise,
      updatedAt: new Date(),
    })
    .where(eq(roomElectricityLedgerCycles.id, cycleId));

  return { collectedPaise, remainingPaise };
}

async function ensureCycleInTx(
  tx: DbTx,
  input: { roomId: string; billingMonth: string; totalBillPaise: number },
): Promise<string> {
  const [existing] = await tx
    .select({ id: roomElectricityLedgerCycles.id, totalBillPaise: roomElectricityLedgerCycles.totalBillPaise })
    .from(roomElectricityLedgerCycles)
    .where(
      and(
        eq(roomElectricityLedgerCycles.roomId, input.roomId),
        eq(roomElectricityLedgerCycles.billingMonth, input.billingMonth),
      ),
    )
    .limit(1);

  const totalBillPaise = Math.max(existing?.totalBillPaise ?? 0, input.totalBillPaise);

  if (existing) {
    await tx
      .update(roomElectricityLedgerCycles)
      .set({ totalBillPaise, updatedAt: new Date() })
      .where(eq(roomElectricityLedgerCycles.id, existing.id));
    return existing.id;
  }

  const [created] = await tx
    .insert(roomElectricityLedgerCycles)
    .values({
      roomId: input.roomId,
      billingMonth: input.billingMonth,
      totalBillPaise,
      collectedPaise: 0,
      remainingPaise: totalBillPaise,
    })
    .returning({ id: roomElectricityLedgerCycles.id });

  return created.id;
}

export async function getRoomElectricityLedgerCycle(
  roomId: string,
  billingMonth: DateLike,
  options?: { fallbackTotalBillPaise?: number },
): Promise<RoomElectricityLedgerCycleView | null> {
  const month = firstOfMonth(billingMonth);
  const [cycle] = await db
    .select()
    .from(roomElectricityLedgerCycles)
    .where(
      and(
        eq(roomElectricityLedgerCycles.roomId, roomId),
        eq(roomElectricityLedgerCycles.billingMonth, month),
      ),
    )
    .limit(1);

  const totalBillPaise =
    cycle?.totalBillPaise ??
    (await resolveRoomMonthlyBillPaise(roomId, month, options?.fallbackTotalBillPaise));

  if (!cycle && totalBillPaise <= 0) return null;

  const entries = cycle
    ? await db
        .select({
          customerId: roomElectricityLedgerEntries.customerId,
          customerName: customers.fullName,
          bookingId: roomElectricityLedgerEntries.bookingId,
          amountPaise: roomElectricityLedgerEntries.amountPaise,
          source: roomElectricityLedgerEntries.source,
          collectedAt: roomElectricityLedgerEntries.collectedAt,
        })
        .from(roomElectricityLedgerEntries)
        .innerJoin(customers, eq(customers.id, roomElectricityLedgerEntries.customerId))
        .where(eq(roomElectricityLedgerEntries.cycleId, cycle.id))
        .orderBy(roomElectricityLedgerEntries.collectedAt)
    : [];

  const collectedPaise = cycle?.collectedPaise ?? 0;
  const remainingPaise =
    cycle?.remainingPaise ?? Math.max(0, totalBillPaise - collectedPaise);

  return {
    billingMonth: month,
    totalBillPaise,
    collectedPaise,
    remainingPaise,
    entries,
  };
}

async function recordCheckoutElectricityLedgerEntryInTx(
  tx: DbTx,
  input: {
    settlement: CheckoutSettlement;
    vacatingDate: string;
    roomId: string;
    amountPaise: number;
    billingMonth: string;
  },
): Promise<void> {
  const stayPeriodStart = null;
  const stayPeriodEnd = input.vacatingDate;

  await tx
    .insert(electricitySettlementLedger)
    .values({
      roomId: input.roomId,
      customerId: input.settlement.customerId,
      bookingId: input.settlement.bookingId,
      checkoutSettlementId: input.settlement.id,
      billingMonth: input.billingMonth,
      stayPeriodStart,
      stayPeriodEnd,
      units: input.settlement.electricityUnits,
      amountPaise: input.amountPaise,
      status: 'collected',
    })
    .onConflictDoNothing({ target: electricitySettlementLedger.checkoutSettlementId });
}

/** Sync room ledger cycle when a monthly electricity bill is created. */
export async function syncRoomElectricityLedgerCycleFromBillInTx(
  tx: DbTx,
  input: {
    roomId: string;
    billingMonth: string;
    totalBillPaise: number;
    electricityBillId: string;
  },
): Promise<void> {
  const cycleId = await ensureCycleInTx(tx, {
    roomId: input.roomId,
    billingMonth: input.billingMonth,
    totalBillPaise: input.totalBillPaise,
  });

  const checkoutRows = await tx
    .select({
      customerId: electricitySettlementLedger.customerId,
      bookingId: electricitySettlementLedger.bookingId,
      amountPaise: electricitySettlementLedger.amountPaise,
      checkoutSettlementId: electricitySettlementLedger.checkoutSettlementId,
      createdAt: electricitySettlementLedger.createdAt,
    })
    .from(electricitySettlementLedger)
    .where(
      and(
        eq(electricitySettlementLedger.roomId, input.roomId),
        eq(electricitySettlementLedger.billingMonth, input.billingMonth),
        sql`${electricitySettlementLedger.status} IN ('collected', 'applied')`,
      ),
    );

  for (const row of checkoutRows) {
    await tx
      .insert(roomElectricityLedgerEntries)
      .values({
        cycleId,
        customerId: row.customerId,
        bookingId: row.bookingId,
        amountPaise: row.amountPaise,
        source: 'checkout_settlement',
        checkoutSettlementId: row.checkoutSettlementId,
        collectedAt: row.createdAt,
      })
      .onConflictDoNothing({
        target: roomElectricityLedgerEntries.checkoutSettlementId,
      });
  }

  await recalculateCycleTotalsInTx(tx, cycleId, input.totalBillPaise);

  await tx
    .update(electricitySettlementLedger)
    .set({ electricityBillId: input.electricityBillId, status: 'applied' })
    .where(
      and(
        eq(electricitySettlementLedger.roomId, input.roomId),
        eq(electricitySettlementLedger.billingMonth, input.billingMonth),
        eq(electricitySettlementLedger.status, 'collected'),
      ),
    );
}

/** Record checkout electricity collection in room ledger + settlement ledger (idempotent). */
export async function recordCheckoutElectricityCollectionInTx(
  tx: DbTx,
  input: {
    settlement: CheckoutSettlement;
    vacatingDate: string;
    roomId: string;
    totalBillPaise?: number;
  },
): Promise<void> {
  const amountPaise = resolveCheckoutElectricityDeductionPaise(input.settlement);
  if (amountPaise <= 0) return;

  const billingMonth = firstOfMonth(input.vacatingDate);
  const totalBillPaise = await resolveRoomMonthlyBillPaise(
    input.roomId,
    billingMonth,
    input.totalBillPaise,
  );

  const cycleId = await ensureCycleInTx(tx, {
    roomId: input.roomId,
    billingMonth,
    totalBillPaise: Math.max(totalBillPaise, amountPaise),
  });

  await recordCheckoutElectricityLedgerEntryInTx(tx, {
    settlement: input.settlement,
    vacatingDate: input.vacatingDate,
    roomId: input.roomId,
    amountPaise,
    billingMonth,
  });

  await tx
    .insert(roomElectricityLedgerEntries)
    .values({
      cycleId,
      customerId: input.settlement.customerId,
      bookingId: input.settlement.bookingId,
      amountPaise,
      source: 'checkout_settlement',
      checkoutSettlementId: input.settlement.id,
    })
    .onConflictDoNothing({
      target: roomElectricityLedgerEntries.checkoutSettlementId,
    });

  await recalculateCycleTotalsInTx(
    tx,
    cycleId,
    Math.max(totalBillPaise, amountPaise),
  );
}

/** Record monthly invoice payment in room electricity ledger. */
export async function recordMonthlyInvoiceCollectionInTx(
  tx: DbTx,
  input: {
    roomId: string;
    billingMonth: string;
    totalBillPaise: number;
    customerId: string;
    bookingId: string;
    amountPaise: number;
    electricityInvoiceId: string;
  },
): Promise<void> {
  if (input.amountPaise <= 0) return;

  const cycleId = await ensureCycleInTx(tx, {
    roomId: input.roomId,
    billingMonth: input.billingMonth,
    totalBillPaise: input.totalBillPaise,
  });

  await tx
    .insert(roomElectricityLedgerEntries)
    .values({
      cycleId,
      customerId: input.customerId,
      bookingId: input.bookingId,
      amountPaise: input.amountPaise,
      source: 'monthly_invoice',
      electricityInvoiceId: input.electricityInvoiceId,
    })
    .onConflictDoNothing({
      target: roomElectricityLedgerEntries.electricityInvoiceId,
    });

  await recalculateCycleTotalsInTx(tx, cycleId, input.totalBillPaise);
}

export async function recordCheckoutElectricityCollectionFromSettlementId(
  settlementId: string,
  options?: { totalBillPaise?: number },
): Promise<void> {
  const [row] = await db
    .select({
      settlement: checkoutSettlements,
      vacatingDate: vacatingRequests.vacatingDate,
      roomId: beds.roomId,
    })
    .from(checkoutSettlements)
    .innerJoin(vacatingRequests, eq(vacatingRequests.id, checkoutSettlements.vacatingRequestId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, checkoutSettlements.bookingId))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(
      and(
        eq(checkoutSettlements.id, settlementId),
        eq(bedReservations.kind, 'primary'),
      ),
    )
    .limit(1);

  if (!row?.roomId) return;

  await db.transaction(async (tx) => {
    await recordCheckoutElectricityCollectionInTx(tx, {
      settlement: row.settlement,
      vacatingDate: String(row.vacatingDate),
      roomId: row.roomId,
      totalBillPaise: options?.totalBillPaise,
    });
  });
}
