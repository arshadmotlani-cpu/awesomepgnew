/**
 * Electricity settlement ledger — reconciles checkout electricity collections
 * against monthly room bills so the same usage is never billed twice.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  beds,
  bedReservations,
  checkoutSettlements,
  customers,
  electricitySettlementLedger,
  vacatingRequests,
} from '@/src/db/schema';
import { formatDate, parseDate } from '@/src/lib/dates';
import { firstOfMonth, monthBounds } from '@/src/services/billing';
import type { CheckoutSettlement } from '@/src/db/schema/checkoutSettlements';
import type { DateLike } from '@/src/lib/dates';

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ElectricitySettlementLedgerRow = {
  id: string;
  roomId: string;
  customerId: string;
  customerName: string;
  bookingId: string;
  checkoutSettlementId: string;
  billingMonth: string;
  stayPeriodStart: string | null;
  stayPeriodEnd: string | null;
  units: string | null;
  amountPaise: number;
  status: string;
  electricityBillId: string | null;
  createdAt: Date;
};

export type RoomCheckoutElectricityReconciliation = {
  billingMonth: string;
  grossBillPaise: number | null;
  checkoutCollectedPaise: number;
  remainingToRecoverPaise: number;
  entries: ElectricitySettlementLedgerRow[];
};

function billingMonthFromVacatingDate(vacatingDate: DateLike): string {
  return firstOfMonth(vacatingDate);
}

async function resolveStayPeriodForBookingMonth(
  bookingId: string,
  billingMonth: string,
): Promise<{ start: string | null; end: string | null }> {
  const { start: monthStart, end: monthEnd } = monthBounds(billingMonth);

  const [row] = await db
    .select({
      lower: sql<string>`lower(${bedReservations.stayRange})::text`,
      upper: sql<string | null>`upper(${bedReservations.stayRange})::text`,
    })
    .from(bedReservations)
    .where(and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.kind, 'primary')))
    .orderBy(sql`${bedReservations.createdAt} DESC`)
    .limit(1);

  if (!row?.lower) return { start: null, end: null };

  const stayStart = parseDate(row.lower);
  const stayEnd = row.upper ? parseDate(row.upper) : monthEnd;
  const intersectStart = stayStart > monthStart ? stayStart : monthStart;
  const intersectEnd = stayEnd < monthEnd ? stayEnd : monthEnd;
  if (intersectEnd <= intersectStart) return { start: null, end: null };

  return {
    start: formatDate(intersectStart),
    end: formatDate(new Date(intersectEnd.getTime() - 86400000)),
  };
}

async function resolveRoomIdForBooking(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({ roomId: beds.roomId })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.kind, 'primary')))
    .orderBy(sql`${bedReservations.createdAt} DESC`)
    .limit(1);
  return row?.roomId ?? null;
}

export async function recordCheckoutElectricityLedgerEntry(input: {
  settlement: CheckoutSettlement;
  vacatingDate: string;
  roomId: string;
}): Promise<void> {
  const { settlement, vacatingDate, roomId } = input;
  if (settlement.electricitySharePaise <= 0) return;
  if (settlement.electricityDeductFromDeposit === false) return;

  const billingMonth = billingMonthFromVacatingDate(vacatingDate);
  const stayPeriod = await resolveStayPeriodForBookingMonth(settlement.bookingId, billingMonth);

  await db
    .insert(electricitySettlementLedger)
    .values({
      roomId,
      customerId: settlement.customerId,
      bookingId: settlement.bookingId,
      checkoutSettlementId: settlement.id,
      billingMonth,
      stayPeriodStart: stayPeriod.start,
      stayPeriodEnd: stayPeriod.end,
      units: settlement.electricityUnits,
      amountPaise: settlement.electricitySharePaise,
      status: 'collected',
    })
    .onConflictDoNothing({ target: electricitySettlementLedger.checkoutSettlementId });
}

export async function sumUnappliedCheckoutElectricityPaise(
  roomId: string,
  billingMonth: DateLike,
): Promise<number> {
  const month = firstOfMonth(billingMonth);
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${electricitySettlementLedger.amountPaise}), 0)::bigint::int`,
    })
    .from(electricitySettlementLedger)
    .where(
      and(
        eq(electricitySettlementLedger.roomId, roomId),
        eq(electricitySettlementLedger.billingMonth, month),
        eq(electricitySettlementLedger.status, 'collected'),
      ),
    );
  return row?.total ?? 0;
}

export async function listCheckoutElectricityLedgerForRoomMonth(
  roomId: string,
  billingMonth: DateLike,
  options?: { status?: 'collected' | 'applied' | 'all' },
): Promise<ElectricitySettlementLedgerRow[]> {
  const month = firstOfMonth(billingMonth);
  const statusFilter =
    options?.status && options.status !== 'all'
      ? eq(electricitySettlementLedger.status, options.status)
      : undefined;

  const rows = await db
    .select({
      id: electricitySettlementLedger.id,
      roomId: electricitySettlementLedger.roomId,
      customerId: electricitySettlementLedger.customerId,
      customerName: customers.fullName,
      bookingId: electricitySettlementLedger.bookingId,
      checkoutSettlementId: electricitySettlementLedger.checkoutSettlementId,
      billingMonth: electricitySettlementLedger.billingMonth,
      stayPeriodStart: electricitySettlementLedger.stayPeriodStart,
      stayPeriodEnd: electricitySettlementLedger.stayPeriodEnd,
      units: electricitySettlementLedger.units,
      amountPaise: electricitySettlementLedger.amountPaise,
      status: electricitySettlementLedger.status,
      electricityBillId: electricitySettlementLedger.electricityBillId,
      createdAt: electricitySettlementLedger.createdAt,
    })
    .from(electricitySettlementLedger)
    .innerJoin(customers, eq(customers.id, electricitySettlementLedger.customerId))
    .where(
      and(
        eq(electricitySettlementLedger.roomId, roomId),
        eq(electricitySettlementLedger.billingMonth, month),
        statusFilter,
      ),
    )
    .orderBy(asc(electricitySettlementLedger.createdAt));

  return rows.map((r) => ({
    ...r,
    billingMonth: String(r.billingMonth),
    stayPeriodStart: r.stayPeriodStart ? String(r.stayPeriodStart) : null,
    stayPeriodEnd: r.stayPeriodEnd ? String(r.stayPeriodEnd) : null,
    units: r.units != null ? String(r.units) : null,
  }));
}

export async function getRoomCheckoutElectricityReconciliation(
  roomId: string,
  billingMonth: DateLike,
  grossBillPaise?: number | null,
): Promise<RoomCheckoutElectricityReconciliation> {
  const month = firstOfMonth(billingMonth);
  const entries = await listCheckoutElectricityLedgerForRoomMonth(roomId, month, {
    status: 'collected',
  });
  const checkoutCollectedPaise = entries.reduce((sum, e) => sum + e.amountPaise, 0);

  return {
    billingMonth: month,
    grossBillPaise: grossBillPaise ?? null,
    checkoutCollectedPaise,
    remainingToRecoverPaise:
      grossBillPaise != null ? Math.max(0, grossBillPaise - checkoutCollectedPaise) : 0,
    entries,
  };
}

export async function applyCheckoutElectricityLedgerToBill(
  tx: DbTx,
  input: {
    roomId: string;
    billingMonth: DateLike;
    electricityBillId: string;
    maxPaise: number;
  },
): Promise<number> {
  if (input.maxPaise <= 0) return 0;

  const month = firstOfMonth(input.billingMonth);
  const entries = await tx
    .select({
      id: electricitySettlementLedger.id,
      amountPaise: electricitySettlementLedger.amountPaise,
    })
    .from(electricitySettlementLedger)
    .where(
      and(
        eq(electricitySettlementLedger.roomId, input.roomId),
        eq(electricitySettlementLedger.billingMonth, month),
        eq(electricitySettlementLedger.status, 'collected'),
      ),
    )
    .orderBy(asc(electricitySettlementLedger.createdAt));

  let remaining = input.maxPaise;
  let appliedTotal = 0;
  const appliedIds: string[] = [];

  for (const entry of entries) {
    if (remaining <= 0) break;
    if (entry.amountPaise <= remaining) {
      appliedIds.push(entry.id);
      appliedTotal += entry.amountPaise;
      remaining -= entry.amountPaise;
    }
  }

  if (appliedIds.length === 0) return 0;

  await tx
    .update(electricitySettlementLedger)
    .set({
      status: 'applied',
      electricityBillId: input.electricityBillId,
    })
    .where(inArray(electricitySettlementLedger.id, appliedIds));

  return appliedTotal;
}

export async function listCheckoutElectricityLedgerForBill(
  electricityBillId: string,
): Promise<ElectricitySettlementLedgerRow[]> {
  const rows = await db
    .select({
      id: electricitySettlementLedger.id,
      roomId: electricitySettlementLedger.roomId,
      customerId: electricitySettlementLedger.customerId,
      customerName: customers.fullName,
      bookingId: electricitySettlementLedger.bookingId,
      checkoutSettlementId: electricitySettlementLedger.checkoutSettlementId,
      billingMonth: electricitySettlementLedger.billingMonth,
      stayPeriodStart: electricitySettlementLedger.stayPeriodStart,
      stayPeriodEnd: electricitySettlementLedger.stayPeriodEnd,
      units: electricitySettlementLedger.units,
      amountPaise: electricitySettlementLedger.amountPaise,
      status: electricitySettlementLedger.status,
      electricityBillId: electricitySettlementLedger.electricityBillId,
      createdAt: electricitySettlementLedger.createdAt,
    })
    .from(electricitySettlementLedger)
    .innerJoin(customers, eq(customers.id, electricitySettlementLedger.customerId))
    .where(eq(electricitySettlementLedger.electricityBillId, electricityBillId))
    .orderBy(asc(electricitySettlementLedger.createdAt));

  return rows.map((r) => ({
    ...r,
    billingMonth: String(r.billingMonth),
    stayPeriodStart: r.stayPeriodStart ? String(r.stayPeriodStart) : null,
    stayPeriodEnd: r.stayPeriodEnd ? String(r.stayPeriodEnd) : null,
    units: r.units != null ? String(r.units) : null,
  }));
}

export async function recordCheckoutElectricityLedgerFromSettlementId(
  settlementId: string,
): Promise<void> {
  const [row] = await db
    .select({
      settlement: checkoutSettlements,
      vacatingDate: vacatingRequests.vacatingDate,
    })
    .from(checkoutSettlements)
    .innerJoin(vacatingRequests, eq(vacatingRequests.id, checkoutSettlements.vacatingRequestId))
    .where(eq(checkoutSettlements.id, settlementId))
    .limit(1);
  if (!row) return;

  const roomId = await resolveRoomIdForBooking(row.settlement.bookingId);
  if (!roomId) return;

  await recordCheckoutElectricityLedgerEntry({
    settlement: row.settlement,
    vacatingDate: String(row.vacatingDate),
    roomId,
  });
}
