/**
 * Electricity room dashboard — all rooms for a billing month in one view.
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityBills, electricityInvoices, floors, pgs, rooms } from '@/src/db/schema';
import { isProductionElectricityBillFilter } from '@/src/lib/billing/electricityProductionFilter';
import {
  collectionPercentage,
  validateElectricityLedgerView,
  type ElectricityRoomValidation,
} from '@/src/lib/billing/electricityValidation';
import { firstOfMonth } from '@/src/services/billing';
import { getElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';
import type { DateLike } from '@/src/lib/dates';

export type ElectricityRoomDashboardRow = {
  roomId: string;
  roomNumber: string;
  pgName: string;
  pgId: string;
  electricityBillId: string | null;
  unitsConsumed: number | null;
  totalBillPaise: number;
  collectedPaise: number;
  outstandingPaise: number;
  overCollectionPaise: number;
  collectionPct: number;
  pendingInvoiceCount: number;
  paidInvoiceCount: number;
  checkoutDeductionCount: number;
  manualAdjustmentCount: number;
  isBalanced: boolean;
  isFullyCollected: boolean;
  hasWarning: boolean;
  validation: ElectricityRoomValidation;
};

export type ElectricityRoomDashboardSummary = {
  billingMonth: string;
  roomCount: number;
  totalBillPaise: number;
  totalCollectedPaise: number;
  totalOutstandingPaise: number;
  roomsWithWarnings: number;
  roomsFullyCollected: number;
  pendingInvoicesTotal: number;
  rows: ElectricityRoomDashboardRow[];
};

export async function loadElectricityRoomDashboard(input: {
  billingMonth: DateLike;
  pgId?: string | null;
}): Promise<ElectricityRoomDashboardSummary> {
  const month = firstOfMonth(input.billingMonth);

  const billRows = await db
    .select({
      billId: electricityBills.id,
      roomId: electricityBills.roomId,
      roomNumber: rooms.roomNumber,
      pgId: pgs.id,
      pgName: pgs.name,
      totalPaise: electricityBills.totalPaise,
      unitsConsumed: electricityBills.unitsConsumed,
    })
    .from(electricityBills)
    .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(electricityBills.billingMonth, month),
        isProductionElectricityBillFilter(),
        isNull(rooms.archivedAt),
        isNull(pgs.archivedAt),
        input.pgId ? eq(pgs.id, input.pgId) : undefined,
      ),
    )
    .orderBy(pgs.name, rooms.roomNumber);

  const rows: ElectricityRoomDashboardRow[] = [];

  for (const bill of billRows) {
    const ledger = await getElectricitySettlementLedgerView({
      roomId: bill.roomId,
      billingMonth: month,
      fallbackTotalBillPaise: bill.totalPaise,
    });
    if (!ledger) continue;

    const validation = validateElectricityLedgerView(ledger);
    const pendingInvoiceCount = ledger.residentAllocations.filter(
      (a) => a.status === 'pending' && a.amountPaise > 0,
    ).length;
    const paidInvoiceCount = ledger.residentAllocations.filter(
      (a) => a.status === 'paid' || a.paidPaise > 0,
    ).length;

    rows.push({
      roomId: bill.roomId,
      roomNumber: bill.roomNumber,
      pgName: bill.pgName,
      pgId: bill.pgId,
      electricityBillId: bill.billId,
      unitsConsumed: bill.unitsConsumed != null ? Number(bill.unitsConsumed) : null,
      totalBillPaise: ledger.totalRoomBillPaise,
      collectedPaise: ledger.collectedPaise,
      outstandingPaise: ledger.outstandingPaise,
      overCollectionPaise: ledger.overCollectionPaise,
      collectionPct: ledger.collectionPercentage,
      pendingInvoiceCount,
      paidInvoiceCount,
      checkoutDeductionCount: ledger.checkoutSettlementCredits.length,
      manualAdjustmentCount: ledger.manualCredits.length,
      isBalanced: ledger.isBalanced,
      isFullyCollected: ledger.isFullyCollected,
      hasWarning: ledger.hasReconciliationWarning || !validation.isValid,
      validation,
    });
  }

  return {
    billingMonth: month,
    roomCount: rows.length,
    totalBillPaise: rows.reduce((s, r) => s + r.totalBillPaise, 0),
    totalCollectedPaise: rows.reduce((s, r) => s + Math.min(r.collectedPaise, r.totalBillPaise), 0),
    totalOutstandingPaise: rows.reduce((s, r) => s + r.outstandingPaise, 0),
    roomsWithWarnings: rows.filter((r) => r.hasWarning).length,
    roomsFullyCollected: rows.filter((r) => r.isFullyCollected).length,
    pendingInvoicesTotal: rows.reduce((s, r) => s + r.pendingInvoiceCount, 0),
    rows,
  };
}

export async function loadElectricityDashboardPgs(): Promise<Array<{ id: string; name: string }>> {
  return db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(isNull(pgs.archivedAt))
    .orderBy(pgs.name);
}
