/**
 * Server-side pre-generation electricity preview for Billing Center.
 * Financial boundary = open meter period (last finalized close → reading date).
 */
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { rooms } from '@/src/db/schema';
import { loadRoomElectricityOccupantsForMonth } from '@/src/lib/billing/roomElectricityOccupants';
import type { RoomElectricityOccupantRow } from '@/src/lib/billing/roomElectricityOccupants';
import { loadVerifiedPriorElectricityCollectionsForOpenMeterPeriod } from '@/src/lib/billing/electricityMeterPeriodPriorCollections';
import { buildElectricityGenerationAllocation } from '@/src/lib/billing/electricityGenerationAllocation';
import { resolveElectricityGenerationMeterPeriod } from '@/src/lib/billing/resolveElectricityGenerationMeterPeriod';
import { loadRoomTransferMeterEvidenceForRoomMonth } from '@/src/lib/roomTransfer/roomChangeTransferMeterEvidence';
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';
import { sumManualElectricityCreditsForRoomMonth } from '@/src/services/electricitySettlementLedgerView';
import { resolveEffectiveBedCountForRoom } from '@/src/services/roomConfigurationSchedule';
import type {
  PgElectricityOccupantPreview,
  PgElectricityRoomGenerationPreview,
} from '@/src/lib/billing/pgElectricityGenerationPreviewPure';

export type { PgElectricityOccupantPreview, PgElectricityRoomGenerationPreview };

async function sumManualElectricityCreditsOverlappingPeriod(
  roomId: string,
  periodStartIso: string,
  periodEndExclusiveIso: string,
): Promise<number> {
  let cursor = firstOfMonth(periodStartIso);
  const lastDay = formatDate(addDays(parseDate(periodEndExclusiveIso), -1));
  const endMonth = firstOfMonth(lastDay);
  let total = 0;
  while (cursor <= endMonth) {
    total += await sumManualElectricityCreditsForRoomMonth(roomId, cursor);
    const d = parseDate(cursor);
    d.setUTCMonth(d.getUTCMonth() + 1);
    cursor = formatDate(d);
  }
  return total;
}

function occupancyBounds(occupant: RoomElectricityOccupantRow): {
  occupancyStart: string;
  occupancyEnd: string;
} {
  let start = occupant.intervals[0]?.startDate ?? '';
  let endExclusive = occupant.intervals[0]?.endDateExclusive ?? '';
  for (const interval of occupant.intervals) {
    if (interval.startDate && interval.startDate < start) start = interval.startDate;
    const end = interval.endDateExclusive ?? endExclusive;
    if (end && end > endExclusive) endExclusive = end;
  }
  const occupancyEnd = endExclusive
    ? formatDate(addDays(parseDate(endExclusive), -1))
    : start;
  return { occupancyStart: start, occupancyEnd };
}

export async function loadPgElectricityRoomGenerationPreview(input: {
  roomId: string;
  billingMonth: string;
  previousReadingUnits: number;
  currentReadingUnits?: number | null;
  ratePerUnitPaise?: number;
  readingDate?: string;
}): Promise<PgElectricityRoomGenerationPreview> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const previousReadingUnits = input.previousReadingUnits;
  const currentReadingUnits =
    input.currentReadingUnits != null && Number.isFinite(input.currentReadingUnits)
      ? input.currentReadingUnits
      : null;

  const meterPeriod = await resolveElectricityGenerationMeterPeriod({
    roomId: input.roomId,
    reportingBillingMonth: billingMonth,
    previousReadingUnits,
    readingDate: input.readingDate,
  });

  const periodStartIso = meterPeriod.periodStartDate;
  const periodEndExclusiveIso = meterPeriod.periodEndExclusive;

  const [occupantLoad, verifiedPrior, transferEvidenceRows, roomRow, activeBedCount] =
    await Promise.all([
      loadRoomElectricityOccupantsForMonth({
        roomId: input.roomId,
        billingMonth,
        includeFixedStay: true,
        useProRataByActiveDays: true,
        meterPeriod: {
          startDate: periodStartIso,
          endDateExclusive: periodEndExclusiveIso,
        },
      }),
      loadVerifiedPriorElectricityCollectionsForOpenMeterPeriod({
        roomId: input.roomId,
        reportingBillingMonth: billingMonth,
        periodStartDate: periodStartIso,
        periodEndExclusive: periodEndExclusiveIso,
        previousFinalizedReadingUnits: previousReadingUnits,
      }),
      loadRoomTransferMeterEvidenceForRoomMonth({
        roomId: input.roomId,
        billingMonth,
      }),
      db
        .select({ prepaidCreditPaise: rooms.electricityPrepaidCreditPaise })
        .from(rooms)
        .where(eq(rooms.id, input.roomId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      resolveEffectiveBedCountForRoom(input.roomId, billingMonth),
    ]);

  const ratePerUnitPaise = input.ratePerUnitPaise ?? 1600;
  const unitsConsumed =
    currentReadingUnits != null
      ? Math.max(0, currentReadingUnits - previousReadingUnits)
      : null;

  let allocationPreview: PgElectricityRoomGenerationPreview['allocationPreview'] = null;
  if (currentReadingUnits != null && unitsConsumed != null) {
    const manualCreditPaise = await sumManualElectricityCreditsOverlappingPeriod(
      input.roomId,
      periodStartIso,
      periodEndExclusiveIso,
    );
    const built = buildElectricityGenerationAllocation({
      meterPeriod,
      previousReadingUnits,
      currentReadingUnits,
      ratePerUnitPaise,
      roomPrepaidCreditPaise: roomRow?.prepaidCreditPaise ?? 0,
      manualCreditPaise,
      verifiedPrior,
      occupantLoad,
      activeBedCount,
    });
    const grossByCustomer = built.allocation.calculatedShareByCustomerId;
    const collectedByCustomer = verifiedPrior.byCustomerId;
    allocationPreview = {
      grossTotalPaise: built.grossTotalPaise,
      invoiceTotalPaise: built.allocation.invoices.reduce((s, i) => s + i.amountPaise, 0),
      remainderPaise: built.allocation.remainderPaise,
      lines: occupantLoad.occupants.map((o) => {
        const bounds = occupancyBounds(o);
        const grossAllocationPaise = grossByCustomer.get(o.customerId) ?? 0;
        const previouslyCollectedPaise = collectedByCustomer.get(o.customerId) ?? 0;
        const invoiceLine = built.allocation.invoices.find((i) => i.customerId === o.customerId);
        return {
          customerId: o.customerId,
          customerName: o.customerName ?? 'Resident',
          occupancyStart: bounds.occupancyStart,
          occupancyEnd: bounds.occupancyEnd,
          occupancyDays: o.occupiedDates?.length ?? o.weight,
          grossAllocationPaise,
          previouslyCollectedPaise,
          finalInvoicePaise: invoiceLine?.amountPaise ?? 0,
        };
      }),
    };
  }

  const collectedByCustomer = verifiedPrior.byCustomerId;
  const evidenceByCustomer = new Map(
    transferEvidenceRows.map((row) => [row.customerId, row] as const),
  );
  const occupants: PgElectricityOccupantPreview[] = occupantLoad.occupants.map((o) => {
    const bounds = occupancyBounds(o);
    return {
      customerId: o.customerId,
      customerName: o.customerName ?? 'Resident',
      occupancyStart: bounds.occupancyStart,
      occupancyEnd: bounds.occupancyEnd,
      occupancyDays: o.occupiedDates?.length ?? o.weight,
      previouslyCollectedPaise: collectedByCustomer.get(o.customerId) ?? 0,
      transferEvidence: evidenceByCustomer.get(o.customerId) ?? null,
    };
  });

  return {
    meterPeriod: {
      reportingBillingMonth: billingMonth,
      periodStartDate: meterPeriod.periodStartDate,
      periodEndDate: meterPeriod.periodEndDate,
      previousReadingUnits,
      currentReadingUnits,
      unitsConsumed,
    },
    priorCollections: { totalPaise: verifiedPrior.totalPaise },
    previouslyCollectedPaise: verifiedPrior.totalPaise,
    occupants,
    transferEvidenceRows,
    allocationPreview,
  };
}
