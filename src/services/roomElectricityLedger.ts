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
  electricityBills,
  roomElectricityLedgerCycles,
  roomElectricityLedgerEntries,
  vacatingRequests,
  type CheckoutSettlement,
} from '@/src/db/schema';
import { resolveCheckoutElectricityDeductionPaise } from '@/src/lib/checkout/electricitySettlementCalc';
import { firstOfMonth } from '@/src/services/billing';
import type { DateLike } from '@/src/lib/dates';
import { formatBillingMonthLabel } from '@/src/lib/billing/formatBillingMonth';
import { recordCheckoutElectricityLedgerEntry } from '@/src/services/electricitySettlementLedger';

export { formatBillingMonthLabel };

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type RoomElectricityLedgerCycleView = {
  billingMonth: string;
  totalBillPaise: number;
  collectedPaise: number;
  remainingPaise: number;
  entries: Array<{
    customerId: string;
    amountPaise: number;
    source: string;
    collectedAt: Date;
  }>;
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
          amountPaise: roomElectricityLedgerEntries.amountPaise,
          source: roomElectricityLedgerEntries.source,
          collectedAt: roomElectricityLedgerEntries.collectedAt,
        })
        .from(roomElectricityLedgerEntries)
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

async function upsertCycleInTx(
  tx: DbTx,
  input: {
    roomId: string;
    billingMonth: string;
    totalBillPaise: number;
    additionalCollectedPaise: number;
  },
): Promise<{ cycleId: string; collectedPaise: number; remainingPaise: number }> {
  const [existing] = await tx
    .select()
    .from(roomElectricityLedgerCycles)
    .where(
      and(
        eq(roomElectricityLedgerCycles.roomId, input.roomId),
        eq(roomElectricityLedgerCycles.billingMonth, input.billingMonth),
      ),
    )
    .limit(1);

  const totalBillPaise = Math.max(
    existing?.totalBillPaise ?? 0,
    input.totalBillPaise,
  );
  const collectedPaise = (existing?.collectedPaise ?? 0) + input.additionalCollectedPaise;
  const remainingPaise = Math.max(0, totalBillPaise - collectedPaise);
  const cappedCollected = Math.min(collectedPaise, totalBillPaise);
  const cappedRemaining = Math.max(0, totalBillPaise - cappedCollected);

  if (existing) {
    await tx
      .update(roomElectricityLedgerCycles)
      .set({
        totalBillPaise,
        collectedPaise: cappedCollected,
        remainingPaise: cappedRemaining,
        updatedAt: new Date(),
      })
      .where(eq(roomElectricityLedgerCycles.id, existing.id));
    return {
      cycleId: existing.id,
      collectedPaise: cappedCollected,
      remainingPaise: cappedRemaining,
    };
  }

  const [created] = await tx
    .insert(roomElectricityLedgerCycles)
    .values({
      roomId: input.roomId,
      billingMonth: input.billingMonth,
      totalBillPaise,
      collectedPaise: cappedCollected,
      remainingPaise: cappedRemaining,
    })
    .returning({ id: roomElectricityLedgerCycles.id });

  return {
    cycleId: created.id,
    collectedPaise: cappedCollected,
    remainingPaise: cappedRemaining,
  };
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

  const { cycleId } = await upsertCycleInTx(tx, {
    roomId: input.roomId,
    billingMonth,
    totalBillPaise: Math.max(totalBillPaise, amountPaise),
    additionalCollectedPaise: amountPaise,
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

  await recordCheckoutElectricityLedgerEntry({
    settlement: {
      ...input.settlement,
      electricitySharePaise: amountPaise,
    },
    vacatingDate: input.vacatingDate,
    roomId: input.roomId,
  });
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