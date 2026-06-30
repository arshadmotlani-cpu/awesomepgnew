/**
 * Electricity Settlement Ledger — SSOT view for room-level electricity accounting.
 * Combines meter bill, checkout credits, manual credits, resident allocations, and reconciliation.
 */
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  customers,
  electricityBills,
  electricityInvoices,
  electricitySettlementLedger,
  roomElectricityLedgerCycles,
  roomElectricityLedgerEntries,
  rooms,
} from '@/src/db/schema';
import {
  computeElectricityCollectionReconciliation,
  computeElectricitySettlementLedgerReconciliation,
} from '@/src/lib/billing/electricitySettlementLedgerReconciliation';
import { firstOfMonth } from '@/src/services/billing';
import type { DateLike } from '@/src/lib/dates';

const MANUAL_CREDIT_SOURCES = ['manual', 'cash', 'upi'] as const;
const COLLECTION_SOURCES = [
  'checkout_settlement',
  'manual',
  'cash',
  'upi',
  'monthly_invoice',
] as const;

export type ElectricitySettlementCreditRow = {
  id: string;
  customerId: string;
  customerName: string;
  amountPaise: number;
  source: string;
  note: string | null;
  collectedAt: Date;
};

export type ElectricitySettlementAllocationRow = {
  invoiceId: string | null;
  bookingId: string | null;
  customerId: string;
  customerName: string;
  invoiceNumber: string | null;
  amountPaise: number;
  paidPaise: number;
  status: string;
  excludedBecauseCheckoutPaid: boolean;
};

export type ElectricitySettlementLedgerView = {
  roomId: string;
  roomNumber: string;
  pgName: string;
  billingMonth: string;
  electricityBillId: string | null;
  totalRoomBillPaise: number;
  prepaidCreditAppliedPaise: number;
  checkoutSettlementCredits: ElectricitySettlementCreditRow[];
  checkoutSettlementTotalPaise: number;
  manualCredits: ElectricitySettlementCreditRow[];
  manualCreditsTotalPaise: number;
  remainingRoomBalancePaise: number;
  residentAllocations: ElectricitySettlementAllocationRow[];
  residentAllocationsTotalPaise: number;
  roundingRemainderPaise: number;
  collectedPaise: number;
  outstandingPaise: number;
  reconciliationGapPaise: number;
  isBalanced: boolean;
  isFullyCollected: boolean;
};

export async function sumManualElectricityCreditsForRoomMonth(
  roomId: string,
  billingMonth: DateLike,
): Promise<number> {
  const month = firstOfMonth(billingMonth);
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${roomElectricityLedgerEntries.amountPaise}), 0)::bigint::int`,
    })
    .from(roomElectricityLedgerEntries)
    .innerJoin(
      roomElectricityLedgerCycles,
      eq(roomElectricityLedgerCycles.id, roomElectricityLedgerEntries.cycleId),
    )
    .where(
      and(
        eq(roomElectricityLedgerCycles.roomId, roomId),
        eq(roomElectricityLedgerCycles.billingMonth, month),
        inArray(roomElectricityLedgerEntries.source, [...MANUAL_CREDIT_SOURCES]),
      ),
    );
  return row?.total ?? 0;
}

export async function getElectricitySettlementLedgerView(input: {
  roomId: string;
  billingMonth: DateLike;
  fallbackTotalBillPaise?: number;
}): Promise<ElectricitySettlementLedgerView | null> {
  const month = firstOfMonth(input.billingMonth);

  const [roomRow] = await db
    .select({
      roomNumber: rooms.roomNumber,
      pgName: sql<string>`(
        SELECT p.name FROM pgs p
        INNER JOIN floors f ON f.pg_id = p.id
        WHERE f.id = ${rooms.floorId}
        LIMIT 1
      )`,
    })
    .from(rooms)
    .where(eq(rooms.id, input.roomId))
    .limit(1);
  if (!roomRow) return null;

  const [bill] = await db
    .select({
      id: electricityBills.id,
      totalPaise: electricityBills.totalPaise,
      prepaidCreditAppliedPaise: electricityBills.prepaidCreditAppliedPaise,
      checkoutCreditAppliedPaise: electricityBills.checkoutCreditAppliedPaise,
      roundingRemainderPaise: electricityBills.roundingRemainderPaise,
    })
    .from(electricityBills)
    .where(
      and(
        eq(electricityBills.roomId, input.roomId),
        eq(electricityBills.billingMonth, month),
      ),
    )
    .limit(1);

  const totalRoomBillPaise =
    bill?.totalPaise ?? Math.max(0, input.fallbackTotalBillPaise ?? 0);
  if (totalRoomBillPaise <= 0 && !bill) return null;

  const checkoutRows = await db
    .select({
      id: electricitySettlementLedger.id,
      customerId: electricitySettlementLedger.customerId,
      customerName: customers.fullName,
      amountPaise: electricitySettlementLedger.amountPaise,
      createdAt: electricitySettlementLedger.createdAt,
    })
    .from(electricitySettlementLedger)
    .innerJoin(customers, eq(customers.id, electricitySettlementLedger.customerId))
    .where(
      and(
        eq(electricitySettlementLedger.roomId, input.roomId),
        eq(electricitySettlementLedger.billingMonth, month),
        sql`${electricitySettlementLedger.status} IN ('collected', 'applied')`,
      ),
    )
    .orderBy(electricitySettlementLedger.createdAt);

  const checkoutSettlementCredits: ElectricitySettlementCreditRow[] = checkoutRows.map((r) => ({
    id: r.id,
    customerId: r.customerId,
    customerName: r.customerName,
    amountPaise: r.amountPaise,
    source: 'checkout_settlement',
    note: null,
    collectedAt: r.createdAt,
  }));
  const checkoutSettlementTotalPaise = checkoutSettlementCredits.reduce(
    (s, r) => s + r.amountPaise,
    0,
  );

  const [cycle] = await db
    .select({ id: roomElectricityLedgerCycles.id })
    .from(roomElectricityLedgerCycles)
    .where(
      and(
        eq(roomElectricityLedgerCycles.roomId, input.roomId),
        eq(roomElectricityLedgerCycles.billingMonth, month),
      ),
    )
    .limit(1);

  let manualCredits: ElectricitySettlementCreditRow[] = [];
  let collectedPaise = checkoutSettlementTotalPaise;

  if (cycle) {
    const ledgerRows = await db
      .select({
        id: roomElectricityLedgerEntries.id,
        customerId: roomElectricityLedgerEntries.customerId,
        customerName: customers.fullName,
        amountPaise: roomElectricityLedgerEntries.amountPaise,
        source: roomElectricityLedgerEntries.source,
        note: roomElectricityLedgerEntries.note,
        collectedAt: roomElectricityLedgerEntries.collectedAt,
      })
      .from(roomElectricityLedgerEntries)
      .innerJoin(customers, eq(customers.id, roomElectricityLedgerEntries.customerId))
      .where(eq(roomElectricityLedgerEntries.cycleId, cycle.id))
      .orderBy(roomElectricityLedgerEntries.collectedAt);

    manualCredits = ledgerRows
      .filter((r) => MANUAL_CREDIT_SOURCES.includes(r.source as (typeof MANUAL_CREDIT_SOURCES)[number]))
      .map((r) => ({
        id: r.id,
        customerId: r.customerId,
        customerName: r.customerName,
        amountPaise: r.amountPaise,
        source: r.source,
        note: r.note,
        collectedAt: r.collectedAt,
      }));

    collectedPaise = ledgerRows
      .filter((r) =>
        COLLECTION_SOURCES.includes(r.source as (typeof COLLECTION_SOURCES)[number]),
      )
      .reduce((s, r) => s + r.amountPaise, 0);
  }

  const manualCreditsTotalPaise = manualCredits.reduce((s, r) => s + r.amountPaise, 0);
  const prepaidCreditAppliedPaise = bill?.prepaidCreditAppliedPaise ?? 0;
  const roundingRemainderPaise = bill?.roundingRemainderPaise ?? 0;

  const checkoutPayerIds = new Set(checkoutSettlementCredits.map((r) => r.customerId));

  const invoiceRows = bill
    ? await db
        .select({
          id: electricityInvoices.id,
          bookingId: electricityInvoices.bookingId,
          customerId: electricityInvoices.customerId,
          customerName: customers.fullName,
          invoiceNumber: electricityInvoices.invoiceNumber,
          amountPaise: electricityInvoices.amountPaise,
          paidPaise: electricityInvoices.paidPaise,
          status: electricityInvoices.status,
        })
        .from(electricityInvoices)
        .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
        .where(
          and(
            eq(electricityInvoices.electricityBillId, bill.id),
            ne(electricityInvoices.status, 'cancelled'),
            isNull(electricityInvoices.supersededByInvoiceId),
          ),
        )
        .orderBy(electricityInvoices.invoiceNumber)
    : [];

  const residentAllocations: ElectricitySettlementAllocationRow[] = invoiceRows.map((inv) => ({
    invoiceId: inv.id,
    bookingId: inv.bookingId,
    customerId: inv.customerId,
    customerName: inv.customerName,
    invoiceNumber: inv.invoiceNumber,
    amountPaise: inv.amountPaise,
    paidPaise: inv.paidPaise,
    status: inv.status,
    excludedBecauseCheckoutPaid: checkoutPayerIds.has(inv.customerId) && inv.amountPaise === 0,
  }));

  for (const payer of checkoutSettlementCredits) {
    if (!residentAllocations.some((a) => a.customerId === payer.customerId)) {
      residentAllocations.push({
        invoiceId: null,
        bookingId: null,
        customerId: payer.customerId,
        customerName: payer.customerName,
        invoiceNumber: null,
        amountPaise: 0,
        paidPaise: payer.amountPaise,
        status: 'checkout_settled',
        excludedBecauseCheckoutPaid: true,
      });
    }
  }

  const residentAllocationsTotalPaise = residentAllocations.reduce(
    (s, r) => s + r.amountPaise,
    0,
  );

  const reconciliation = computeElectricitySettlementLedgerReconciliation({
    totalRoomBillPaise,
    prepaidCreditAppliedPaise,
    checkoutSettlementCreditsPaise: checkoutSettlementTotalPaise,
    manualCreditsPaise: manualCreditsTotalPaise,
    residentAllocationsPaise: residentAllocationsTotalPaise,
    roundingRemainderPaise,
  });

  const collection = computeElectricityCollectionReconciliation({
    totalRoomBillPaise,
    collectedPaise,
  });

  return {
    roomId: input.roomId,
    roomNumber: roomRow.roomNumber,
    pgName: roomRow.pgName,
    billingMonth: month,
    electricityBillId: bill?.id ?? null,
    totalRoomBillPaise,
    prepaidCreditAppliedPaise,
    checkoutSettlementCredits,
    checkoutSettlementTotalPaise,
    manualCredits,
    manualCreditsTotalPaise,
    remainingRoomBalancePaise: reconciliation.remainingRoomBalancePaise,
    residentAllocations,
    residentAllocationsTotalPaise,
    roundingRemainderPaise,
    collectedPaise,
    outstandingPaise: collection.outstandingPaise,
    reconciliationGapPaise: reconciliation.reconciliationGapPaise,
    isBalanced: reconciliation.isBalanced,
    isFullyCollected: collection.isFullyCollected,
  };
}
