/**
 * Build and load transparent electricity bill calculation breakdown.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityBills, electricityInvoices, rooms } from '@/src/db/schema';
import type { RoomElectricityOccupantLoadResult } from '@/src/lib/billing/roomElectricityOccupants';
import type { ElectricityBillCalculationBreakdown } from '@/src/lib/billing/electricityBillBreakdownTypes';
import { buildElectricityBillBreakdownFromContext } from '@/src/lib/billing/electricityBillBreakdownPure';
import { loadRoomElectricityTimelineForMonth } from '@/src/lib/billing/roomElectricityTimeline';

export {
  buildElectricityBillBreakdownFromContext,
  breakdownToInvoiceLines,
  personalizeElectricityBreakdown,
} from '@/src/lib/billing/electricityBillBreakdownPure';

export async function composeElectricityBillBreakdown(input: {
  roomId: string;
  roomNumber: string;
  billingMonth: string;
  previousReadingUnits: number;
  currentReadingUnits: number;
  ratePerUnitPaise: number;
  grossTotalPaise: number;
  prepaidCreditPaise: number;
  prepaidCreditNote?: string | null;
  manualCreditPaise: number;
  checkoutCreditAppliedPaise: number;
  remainingBillPaise: number;
  useProRata: boolean;
  occupantLoad: RoomElectricityOccupantLoadResult;
  invoiceAmountByBookingId: Map<string, number>;
  previousContributions?: ElectricityBillCalculationBreakdown['previousContributions'];
}): Promise<ElectricityBillCalculationBreakdown> {
  const timelineRows = await loadRoomElectricityTimelineForMonth({
    roomId: input.roomId,
    billingMonth: input.billingMonth,
  });

  const checkoutCredits: ElectricityBillCalculationBreakdown['adjustments']['checkoutCredits'] = [];
  for (const row of timelineRows) {
    const credit = row.settlement?.creditAppliedToRoomBillPaise ?? 0;
    if (credit <= 0) continue;
    checkoutCredits.push({
      customerId: row.customerId,
      customerName: row.customerName,
      amountPaise: credit,
      recoveredFromDepositPaise: row.settlement?.recoveredFromDepositPaise ?? 0,
      collectedDuringCheckoutPaise: row.settlement?.collectedDuringCheckoutPaise ?? 0,
    });
  }

  for (const [customerId, amount] of input.occupantLoad.checkoutCollectedByCustomerId) {
    if (checkoutCredits.some((c) => c.customerId === customerId)) continue;
    if (amount <= 0) continue;
    const row = timelineRows.find((r) => r.customerId === customerId);
    checkoutCredits.push({
      customerId,
      customerName: row?.customerName ?? 'Former resident',
      amountPaise: amount,
      recoveredFromDepositPaise: amount,
      collectedDuringCheckoutPaise: 0,
    });
  }

  return buildElectricityBillBreakdownFromContext({
    ...input,
    timelineRows,
    checkoutCredits,
    previousContributions: input.previousContributions,
  });
}

export async function loadElectricityBillBreakdown(
  billId: string,
): Promise<ElectricityBillCalculationBreakdown | null> {
  const [bill] = await db
    .select({
      id: electricityBills.id,
      roomId: electricityBills.roomId,
      roomNumber: rooms.roomNumber,
      billingMonth: electricityBills.billingMonth,
      previousReadingUnits: electricityBills.previousReadingUnits,
      currentReadingUnits: electricityBills.currentReadingUnits,
      ratePerUnitPaise: electricityBills.ratePerUnitPaise,
      totalPaise: electricityBills.totalPaise,
      prepaidCreditAppliedPaise: electricityBills.prepaidCreditAppliedPaise,
      prepaidCreditNote: electricityBills.prepaidCreditNote,
      checkoutCreditAppliedPaise: electricityBills.checkoutCreditAppliedPaise,
      calculationBreakdown: electricityBills.calculationBreakdown,
    })
    .from(electricityBills)
    .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
    .where(eq(electricityBills.id, billId))
    .limit(1);

  if (!bill) return null;
  if (bill.calculationBreakdown) {
    const stored = bill.calculationBreakdown as ElectricityBillCalculationBreakdown;
    return {
      ...stored,
      previousContributions: stored.previousContributions ?? [],
    };
  }

  const allInvoices = await db
    .select({
      bookingId: electricityInvoices.bookingId,
      amountPaise: electricityInvoices.amountPaise,
      status: electricityInvoices.status,
    })
    .from(electricityInvoices)
    .where(eq(electricityInvoices.electricityBillId, billId));

  const invoiceAmountByBookingId = new Map<string, number>();
  for (const inv of allInvoices) {
    if (inv.status === 'cancelled') continue;
    invoiceAmountByBookingId.set(inv.bookingId, inv.amountPaise);
  }

  const { sumManualElectricityCreditsForRoomMonth } = await import(
    '@/src/services/electricitySettlementLedgerView'
  );
  const manualCreditPaise = await sumManualElectricityCreditsForRoomMonth(
    bill.roomId,
    bill.billingMonth,
  );

  const grossTotalPaise = bill.totalPaise;
  const remainingBillPaise = Math.max(
    0,
    grossTotalPaise -
      bill.prepaidCreditAppliedPaise -
      bill.checkoutCreditAppliedPaise -
      manualCreditPaise,
  );

  const timelineRows = await loadRoomElectricityTimelineForMonth({
    roomId: bill.roomId,
    billingMonth: bill.billingMonth,
  });

  const checkoutCredits = timelineRows
    .filter((r) => (r.settlement?.creditAppliedToRoomBillPaise ?? 0) > 0)
    .map((r) => ({
      customerId: r.customerId,
      customerName: r.customerName,
      amountPaise: r.settlement!.creditAppliedToRoomBillPaise,
      recoveredFromDepositPaise: r.settlement!.recoveredFromDepositPaise,
      collectedDuringCheckoutPaise: r.settlement!.collectedDuringCheckoutPaise,
    }));

  const { listRoomElectricityContributionsForMonth } = await import(
    '@/src/services/electricityRoomContributions'
  );
  const contributionRows = await listRoomElectricityContributionsForMonth(
    bill.roomId,
    bill.billingMonth,
  );

  return buildElectricityBillBreakdownFromContext({
    roomNumber: bill.roomNumber,
    billingMonth: bill.billingMonth,
    previousReadingUnits: Number(bill.previousReadingUnits),
    currentReadingUnits: Number(bill.currentReadingUnits),
    ratePerUnitPaise: bill.ratePerUnitPaise,
    grossTotalPaise,
    prepaidCreditPaise: bill.prepaidCreditAppliedPaise,
    prepaidCreditNote: bill.prepaidCreditNote,
    manualCreditPaise,
    checkoutCreditAppliedPaise: bill.checkoutCreditAppliedPaise,
    remainingBillPaise,
    useProRata: true,
    timelineRows,
    invoiceAmountByBookingId,
    checkoutCredits,
    previousContributions: contributionRows.map((row) => ({
      customerId: row.customerId,
      customerName: row.customerName,
      bookingId: row.bookingId,
      amountPaise: row.amountPaise,
      kind: row.kind,
      reason: row.reason,
      contributionDate: row.contributionDate,
    })),
  });
}
