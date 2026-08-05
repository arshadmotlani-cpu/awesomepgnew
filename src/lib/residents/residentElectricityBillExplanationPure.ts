/**
 * Pure helpers for resident electricity bill explanation — client-safe, no DB.
 */
import type { ElectricityBillCalculationBreakdown, ElectricityTimelineEntry } from '@/src/lib/billing/electricityBillBreakdownTypes';
import type { RoomElectricityResidentSettlementRow } from '@/src/roomOs/engines/electricity/buildRoomElectricitySettlement';
import type {
  ResidentElectricityBillExplanation,
  ResidentElectricityBillParticipant,
  ResidentElectricityParticipantStatus,
} from '@/src/lib/residents/residentElectricityBillExplanationTypes';

export function residentElectricityParticipantStatus(input: {
  timelineEntry: ElectricityTimelineEntry;
  settlement: RoomElectricityResidentSettlementRow | null;
}): ResidentElectricityParticipantStatus {
  const { timelineEntry, settlement } = input;

  if (
    timelineEntry.settlementStatus === 'recovered_from_deposit' ||
    timelineEntry.recoveredFromDepositPaise > 0 ||
    (settlement?.amountDeductedFromDepositPaise ?? 0) > 0
  ) {
    return 'Recovered from Deposit';
  }

  const outstanding = settlement?.outstandingPaise ?? 0;
  const paid = settlement?.amountPaidPaise ?? 0;
  const owed = settlement?.amountOwedPaise ?? 0;

  if (outstanding > 0) return 'Pending';
  if (paid > 0 && owed > 0) return 'Paid';
  if (timelineEntry.settlementStatus === 'already_collected_at_checkout') return 'Paid';
  if (timelineEntry.settlementStatus === 'fully_settled' && owed > 0) return 'Paid';
  if (owed <= 0 && timelineEntry.calculatedSharePaise <= 0) return 'Waived';
  if (timelineEntry.settlementStatus === 'excluded_zero_balance') return 'Waived';

  return 'Adjusted';
}

export function participantAmountAllocatedPaise(input: {
  timelineEntry: ElectricityTimelineEntry;
  settlement: RoomElectricityResidentSettlementRow | null;
}): number {
  const { timelineEntry, settlement } = input;
  if (settlement && settlement.amountOwedPaise > 0) return settlement.amountOwedPaise;
  if (timelineEntry.monthlyInvoiceAmountPaise > 0) return timelineEntry.monthlyInvoiceAmountPaise;
  if (timelineEntry.calculatedSharePaise > 0) return timelineEntry.calculatedSharePaise;
  if (timelineEntry.creditAppliedToRoomBillPaise > 0) return timelineEntry.creditAppliedToRoomBillPaise;
  if (timelineEntry.recoveredFromDepositPaise > 0) return timelineEntry.recoveredFromDepositPaise;
  return settlement?.amountOwedPaise ?? 0;
}

function participatedInCalculation(entry: ElectricityTimelineEntry): boolean {
  return (
    entry.calculatedSharePaise > 0 ||
    entry.monthlyInvoiceAmountPaise > 0 ||
    entry.creditAppliedToRoomBillPaise > 0 ||
    entry.recoveredFromDepositPaise > 0 ||
    entry.collectedDuringCheckoutPaise > 0
  );
}

export function buildResidentElectricityBillExplanation(input: {
  breakdown: ElectricityBillCalculationBreakdown;
  settlementRows: RoomElectricityResidentSettlementRow[];
  bedCodeByCustomerId: Map<string, string>;
  viewerCustomerId: string;
  yourSharePaise: number;
  lateFeeWaived: boolean;
  lateFeePaise: number;
  roomTotalPaise: number;
  recoveredFromDepositPaise: number;
  collectedPaise: number;
  outstandingPaise: number;
}): ResidentElectricityBillExplanation {
  const settlementByCustomer = new Map(
    input.settlementRows.map((row) => [row.customerId, row] as const),
  );

  const participants: ResidentElectricityBillParticipant[] = input.breakdown.timeline
    .filter(participatedInCalculation)
    .map((entry) => {
      const settlement = settlementByCustomer.get(entry.customerId) ?? null;
      return {
        name: entry.customerName,
        bedCode: input.bedCodeByCustomerId.get(entry.customerId) ?? '—',
        stayDurationLabel: `Stayed ${entry.activeDays} day${entry.activeDays === 1 ? '' : 's'}`,
        amountAllocatedPaise: participantAmountAllocatedPaise({ timelineEntry: entry, settlement }),
        status: residentElectricityParticipantStatus({ timelineEntry: entry, settlement }),
        isViewer: entry.customerId === input.viewerCustomerId,
      };
    });

  const lateFeeLabel = input.lateFeeWaived
    ? 'Waived'
    : input.lateFeePaise > 0
      ? `₹${(input.lateFeePaise / 100).toFixed(2)}`
      : 'None';

  return {
    billingMonth: input.breakdown.billingMonth,
    roomNumber: input.breakdown.roomNumber,
    meter: {
      previousReadingUnits: input.breakdown.meter.previousReadingUnits,
      currentReadingUnits: input.breakdown.meter.currentReadingUnits,
      unitsConsumed: input.breakdown.meter.unitsConsumed,
      ratePerUnitPaise: input.breakdown.meter.ratePerUnitPaise,
      totalRoomBillPaise: input.breakdown.meter.grossTotalPaise,
    },
    participants,
    summary: {
      roomTotalPaise: input.roomTotalPaise,
      recoveredFromDepositPaise: input.recoveredFromDepositPaise,
      collectedPaise: input.collectedPaise,
      outstandingPaise: input.outstandingPaise,
      yourSharePaise: input.yourSharePaise,
      lateFeeLabel,
    },
  };
}
