/**
 * Resident Brain + Room Brain SSOT loader for electricity bill explanation.
 */
import { eq, inArray, and } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds, bookings, bedReservations, electricityBills, electricityInvoices } from '@/src/db/schema';
import { buildResidentElectricityBillExplanation } from '@/src/lib/residents/residentElectricityBillExplanationPure';
import type { ResidentElectricityBillExplanation } from '@/src/lib/residents/residentElectricityBillExplanationTypes';
import { buildRoomElectricitySettlementSnapshot } from '@/src/roomOs/engines/electricity/buildRoomElectricitySettlement';
import {
  getElectricityBreakdownForInvoice,
  projectElectricityInvoice,
} from '@/src/services/electricityBilling';

async function loadBedCodesByCustomerId(
  bookingIds: string[],
): Promise<Map<string, string>> {
  if (bookingIds.length === 0) return new Map();
  const rows = await db
    .select({
      customerId: bookings.customerId,
      bedCode: beds.bedCode,
    })
    .from(bookings)
    .innerJoin(
      bedReservations,
      and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
    )
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(inArray(bookings.id, bookingIds));

  return new Map(rows.map((r) => [r.customerId, r.bedCode] as const));
}

export async function loadResidentElectricityBillExplanation(
  invoiceId: string,
  viewerCustomerId: string,
): Promise<ResidentElectricityBillExplanation | null> {
  const [invoiceRow] = await db
    .select()
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, invoiceId))
    .limit(1);
  if (!invoiceRow) return null;

  const [billRow] = await db
    .select({ roomId: electricityBills.roomId })
    .from(electricityBills)
    .where(eq(electricityBills.id, invoiceRow.electricityBillId))
    .limit(1);
  if (!billRow) return null;

  const [breakdownResult, roomSettlement] = await Promise.all([
    getElectricityBreakdownForInvoice(invoiceId),
    buildRoomElectricitySettlementSnapshot({
      roomId: billRow.roomId,
      billingMonth: String(invoiceRow.billingMonth),
    }),
  ]);

  if (!breakdownResult) return null;

  const projection = projectElectricityInvoice(invoiceRow);
  const settlementRows = [
    ...(roomSettlement?.residentsSettled ?? []),
    ...(roomSettlement?.residentsPending ?? []),
  ];

  const bookingIds = breakdownResult.breakdown.timeline
    .map((entry) => entry.bookingId)
    .filter((id): id is string => Boolean(id));
  const bedCodeByCustomerId = await loadBedCodesByCustomerId(bookingIds);

  const viewerSettlement = settlementRows.find((row) => row.customerId === viewerCustomerId);
  const yourSharePaise = viewerSettlement?.amountOwedPaise ?? invoiceRow.amountPaise;

  return buildResidentElectricityBillExplanation({
    breakdown: breakdownResult.breakdown,
    settlementRows,
    bedCodeByCustomerId,
    viewerCustomerId,
    yourSharePaise,
    lateFeeWaived: invoiceRow.lateFeeWaived === true,
    lateFeePaise: projection.accruedLateFeePaise,
    roomTotalPaise: roomSettlement?.grossRoomBillPaise ?? breakdownResult.breakdown.meter.grossTotalPaise,
    recoveredFromDepositPaise:
      roomSettlement?.collectedFromDepositsPaise ??
      breakdownResult.breakdown.adjustments.checkoutCredits.reduce(
        (sum, credit) => sum + credit.recoveredFromDepositPaise,
        0,
      ),
    collectedPaise: roomSettlement?.alreadyCollectedPaise ?? 0,
    outstandingPaise:
      roomSettlement?.pendingCollectionPaise ?? breakdownResult.breakdown.remainingBillPaise,
  });
}

export async function loadResidentElectricityBillExplanations(
  invoiceIds: string[],
  viewerCustomerId: string,
): Promise<Map<string, ResidentElectricityBillExplanation>> {
  const uniqueIds = [...new Set(invoiceIds)];
  const entries = await Promise.all(
    uniqueIds.map(async (id) => {
      const explanation = await loadResidentElectricityBillExplanation(id, viewerCustomerId);
      return [id, explanation] as const;
    }),
  );

  const map = new Map<string, ResidentElectricityBillExplanation>();
  for (const [id, explanation] of entries) {
    if (explanation) map.set(id, explanation);
  }
  return map;
}
