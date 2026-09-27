/**
 * Room electricity meter-period ledger — meter gross, collection credits, occupancy allocation.
 *
 * When a billing month has a finalized electricity_bills row and checkout closing exceeds
 * that bill's closing reading, unbilled consumption is modeled as a separate tail period
 * (e.g. 424→479) without rebilling the finalized interval (337→424).
 */
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import { resolveTailOccupancyPeriod } from '@/src/lib/billing/electricityMeterPeriodSsot';
import {
  allocateRoomElectricityCheckout,
  type RoomOccupantSlice,
  type OccupantElectricityLine,
} from '@/src/lib/checkout/roomElectricityAllocation';

export type FinalizedBillMeterPeriod = {
  billingMonth: string;
  openingUnits: number;
  closingUnits: number;
  grossPaise: number;
  ratePerUnitPaise: number;
  periodStartDate: string;
  periodEndDate: string;
  /** Day after periodEndDate — tail meter interval starts here. */
  finalizedOnDate: string;
};

export type ResidentInvoiceCredit = {
  customerId: string;
  customerName: string;
  amountPaise: number;
  paidPaise: number;
  status: string;
};

export type MeterPeriodLedgerRow = {
  id: string;
  label: string;
  openingUnits: number;
  closingUnits: number;
  unitsConsumed: number;
  ratePerUnitPaise: number;
  grossPaise: number;
  collectedPaise: number;
  remainingPaise: number;
  locked: boolean;
  periodStart: string;
  periodEndExclusive: string;
};

export type ResidentCollectionDisplayRow = {
  customerId: string;
  customerName: string;
  collectedPaise: number;
};

export type CurrentResidentMeterCheckoutLine = {
  customerId: string;
  occupancyStart: string;
  occupancyEndExclusive: string | null;
  /** Occupancy-weighted share of unbilled tail gross only. */
  tailCalculatedSharePaise: number;
  /** Payments credited to tail period only (not finalized invoice). */
  tailAlreadyCollectedPaise: number;
  /** Outstanding tail share after tail collections. */
  tailRemainingPaise: number;
  /** Unpaid portion of finalized electricity invoice for this resident. */
  finalizedInvoiceRemainingPaise: number;
  /** Total deposit deduction = finalized invoice remaining + tail remaining. */
  totalElectricityDeductionPaise: number;
  /** @deprecated Use tailCalculatedSharePaise — kept for transitional UI. */
  calculatedSharePaise: number;
  /** @deprecated Split fields above — do not add finalized + tail paid together. */
  alreadyCollectedPaise: number;
  /** Same as totalElectricityDeductionPaise. */
  remainingPaise: number;
  depositDeductionPaise: number;
};

export type RoomElectricityMeterPeriodLedger = {
  billingMonth: string;
  ratePerUnitPaise: number;
  periods: MeterPeriodLedgerRow[];
  collectionRows: ResidentCollectionDisplayRow[];
  totalCollectedPaise: number;
  totalRemainingRoomPaise: number;
  primaryPeriodId: string | null;
  tailAllocationLines: OccupantElectricityLine[];
  currentResident: CurrentResidentMeterCheckoutLine;
  suggestedDepositDeductionPaise: number;
};

export type BuildRoomElectricityMeterPeriodLedgerInput = {
  billingMonth: string;
  vacatingDate: string;
  ratePerUnitPaise: number;
  chainOpeningUnits: number | null;
  checkoutClosingUnits: number;
  finalizedBill: FinalizedBillMeterPeriod | null;
  invoiceCredits: ResidentInvoiceCredit[];
  extraCollectedByCustomerId?: Map<string, number>;
  occupants: RoomOccupantSlice[];
  /** Occupants for tail allocation — when omitted, uses `occupants`. */
  tailOccupants?: RoomOccupantSlice[];
  currentCustomerId: string;
  electricityDeductFromDeposit: boolean;
};

function grossFromUnits(units: number, ratePerUnitPaise: number): number {
  return Math.round(units * ratePerUnitPaise);
}

function vacatingExclusiveEnd(vacatingDate: string): string {
  return formatDate(new Date(parseDate(vacatingDate).getTime() + 86_400_000));
}

function sumPaidInvoices(invoices: ResidentInvoiceCredit[]): number {
  return invoices.reduce((sum, row) => {
    if (row.status === 'cancelled') return sum;
    return sum + Math.max(0, row.paidPaise);
  }, 0);
}

function residentInvoiceRemaining(
  invoices: ResidentInvoiceCredit[],
  customerId: string,
): number {
  const row = invoices.find((i) => i.customerId === customerId && i.status !== 'cancelled');
  if (!row) return 0;
  return Math.max(0, row.amountPaise - row.paidPaise);
}

function buildCollectionRows(invoices: ResidentInvoiceCredit[]): ResidentCollectionDisplayRow[] {
  const byCustomer = new Map<string, ResidentCollectionDisplayRow>();
  for (const inv of invoices) {
    if (inv.status === 'cancelled' || inv.paidPaise <= 0) continue;
    const existing = byCustomer.get(inv.customerId);
    if (existing) {
      existing.collectedPaise += inv.paidPaise;
    } else {
      byCustomer.set(inv.customerId, {
        customerId: inv.customerId,
        customerName: inv.customerName,
        collectedPaise: inv.paidPaise,
      });
    }
  }
  return [...byCustomer.values()].sort((a, b) => a.customerName.localeCompare(b.customerName));
}

function allocateTailPeriod(input: {
  billingMonth: string;
  periodStart: string;
  periodEndExclusive: string;
  grossPaise: number;
  unitsConsumed: number;
  occupants: RoomOccupantSlice[];
  collectedByCustomerId: Map<string, number>;
  currentCustomerId: string;
}): {
  currentSharePaise: number;
  currentCollectedPaise: number;
  currentRemainingPaise: number;
  occupants: OccupantElectricityLine[];
} {
  if (input.grossPaise <= 0) {
    return {
      currentSharePaise: 0,
      currentCollectedPaise: 0,
      currentRemainingPaise: 0,
      occupants: [],
    };
  }
  const allocation = allocateRoomElectricityCheckout({
    billingMonth: input.billingMonth,
    periodStart: input.periodStart,
    periodEndExclusive: input.periodEndExclusive,
    totalBillPaise: input.grossPaise,
    unitsConsumed: input.unitsConsumed,
    occupants: input.occupants,
    collectedByCustomerId: input.collectedByCustomerId,
    currentCustomerId: input.currentCustomerId,
  });
  return {
    currentSharePaise: allocation.currentResidentFairSharePaise,
    currentCollectedPaise: allocation.currentResidentCollectedPaise,
    currentRemainingPaise: Math.max(0, allocation.currentResidentRemainingDuePaise),
    occupants: allocation.occupants,
  };
}

export function buildRoomElectricityMeterPeriodLedger(
  input: BuildRoomElectricityMeterPeriodLedgerInput,
): RoomElectricityMeterPeriodLedger {
  const periods: MeterPeriodLedgerRow[] = [];
  const periodEndForVacating = vacatingExclusiveEnd(input.vacatingDate);

  let finalizedRemainingForCurrent = 0;
  let tailRemainingForCurrent = 0;
  let tailShare = 0;
  let tailCollected = 0;
  let tailAllocationLines: OccupantElectricityLine[] = [];
  let primaryPeriodId: string | null = null;

  const collectionRows = buildCollectionRows(input.invoiceCredits);
  const totalCollected = collectionRows.reduce((s, r) => s + r.collectedPaise, 0);

  if (input.finalizedBill) {
    const fb = input.finalizedBill;
    const units = fb.closingUnits - fb.openingUnits;
    const collected = sumPaidInvoices(input.invoiceCredits);
    const remaining = Math.max(0, fb.grossPaise - collected);
    periods.push({
      id: 'finalized',
      label: 'Finalized monthly bill',
      openingUnits: fb.openingUnits,
      closingUnits: fb.closingUnits,
      unitsConsumed: units,
      ratePerUnitPaise: fb.ratePerUnitPaise,
      grossPaise: fb.grossPaise,
      collectedPaise: collected,
      remainingPaise: remaining,
      locked: true,
      periodStart: fb.periodStartDate,
      periodEndExclusive: fb.finalizedOnDate,
    });
    finalizedRemainingForCurrent = residentInvoiceRemaining(
      input.invoiceCredits,
      input.currentCustomerId,
    );
  }

  const tailOpening =
    input.finalizedBill?.closingUnits ??
    input.chainOpeningUnits ??
    input.checkoutClosingUnits;
  const hasTail =
    input.checkoutClosingUnits > tailOpening &&
    (!input.finalizedBill || input.checkoutClosingUnits > input.finalizedBill.closingUnits);

  if (hasTail) {
    const tailUnits = input.checkoutClosingUnits - tailOpening;
    const tailGross = grossFromUnits(tailUnits, input.ratePerUnitPaise);
    const tailOccupancy =
      input.finalizedBill != null
        ? resolveTailOccupancyPeriod({
            finalizedPeriodEndDate: input.finalizedBill.periodEndDate,
            vacatingDate: input.vacatingDate,
          })
        : {
            periodStart: input.billingMonth,
            periodEndExclusive: periodEndForVacating,
          };
    const tailStart = tailOccupancy.periodStart;
    const tailEnd = tailOccupancy.periodEndExclusive;
    const tailOccupants = input.tailOccupants ?? input.occupants;
    const tailCollectedMap = new Map<string, number>();
    if (input.extraCollectedByCustomerId) {
      for (const [cid, amt] of input.extraCollectedByCustomerId) {
        if (amt > 0) tailCollectedMap.set(cid, amt);
      }
    }
    const tailCollectedTotal = [...tailCollectedMap.values()].reduce((s, n) => s + n, 0);
    const tailRemaining = Math.max(0, tailGross - tailCollectedTotal);
    periods.push({
      id: 'unbilled_tail',
      label: 'Unbilled consumption (checkout meter)',
      openingUnits: tailOpening,
      closingUnits: input.checkoutClosingUnits,
      unitsConsumed: tailUnits,
      ratePerUnitPaise: input.ratePerUnitPaise,
      grossPaise: tailGross,
      collectedPaise: tailCollectedTotal,
      remainingPaise: tailRemaining,
      locked: false,
      periodStart: tailStart,
      periodEndExclusive: tailEnd,
    });
    primaryPeriodId = 'unbilled_tail';
    const tailAlloc = allocateTailPeriod({
      billingMonth: input.billingMonth,
      periodStart: tailStart,
      periodEndExclusive: tailEnd,
      grossPaise: tailGross,
      unitsConsumed: tailUnits,
      occupants: tailOccupants,
      collectedByCustomerId: tailCollectedMap,
      currentCustomerId: input.currentCustomerId,
    });
    tailShare = tailAlloc.currentSharePaise;
    tailCollected = tailAlloc.currentCollectedPaise;
    tailRemainingForCurrent = tailAlloc.currentRemainingPaise;
    tailAllocationLines = tailAlloc.occupants;
  } else if (!input.finalizedBill && input.chainOpeningUnits != null) {
    const opening = input.chainOpeningUnits;
    const closing = input.checkoutClosingUnits;
    if (closing > opening) {
      const units = closing - opening;
      const gross = grossFromUnits(units, input.ratePerUnitPaise);
      const collectedMap = new Map<string, number>();
      for (const inv of input.invoiceCredits) {
        if (inv.status === 'cancelled') continue;
        collectedMap.set(
          inv.customerId,
          (collectedMap.get(inv.customerId) ?? 0) + inv.paidPaise,
        );
      }
      if (input.extraCollectedByCustomerId) {
        for (const [cid, amt] of input.extraCollectedByCustomerId) {
          collectedMap.set(cid, (collectedMap.get(cid) ?? 0) + amt);
        }
      }
      const collected = [...collectedMap.values()].reduce((s, n) => s + n, 0);
      const remaining = Math.max(0, gross - collected);
      periods.push({
        id: 'open',
        label: 'Meter period (checkout)',
        openingUnits: opening,
        closingUnits: closing,
        unitsConsumed: units,
        ratePerUnitPaise: input.ratePerUnitPaise,
        grossPaise: gross,
        collectedPaise: collected,
        remainingPaise: remaining,
        locked: false,
        periodStart: input.billingMonth,
        periodEndExclusive: periodEndForVacating,
      });
      primaryPeriodId = 'open';
      const openAlloc = allocateTailPeriod({
        billingMonth: input.billingMonth,
        periodStart: input.billingMonth,
        periodEndExclusive: periodEndForVacating,
        grossPaise: gross,
        unitsConsumed: units,
        occupants: input.occupants,
        collectedByCustomerId: collectedMap,
        currentCustomerId: input.currentCustomerId,
      });
      tailShare = openAlloc.currentSharePaise;
      tailCollected = openAlloc.currentCollectedPaise;
      tailRemainingForCurrent = openAlloc.currentRemainingPaise;
    }
  } else if (input.finalizedBill) {
    primaryPeriodId = 'finalized';
  }

  const currentOccupant = input.occupants.find((o) => o.customerId === input.currentCustomerId);
  const residentTotalRemaining = finalizedRemainingForCurrent + tailRemainingForCurrent;
  const suggestedDepositDeductionPaise = input.electricityDeductFromDeposit
    ? residentTotalRemaining
    : 0;

  const currentInvoicePaid =
    input.invoiceCredits.find((i) => i.customerId === input.currentCustomerId)?.paidPaise ?? 0;

  return {
    billingMonth: input.billingMonth,
    ratePerUnitPaise: input.ratePerUnitPaise,
    periods,
    collectionRows,
    totalCollectedPaise: totalCollected,
    totalRemainingRoomPaise: periods.reduce((s, p) => s + p.remainingPaise, 0),
    primaryPeriodId,
    tailAllocationLines,
    currentResident: {
      customerId: input.currentCustomerId,
      occupancyStart: currentOccupant?.stayStart ?? input.billingMonth,
      occupancyEndExclusive:
        currentOccupant?.stayEndExclusive ?? vacatingExclusiveEnd(input.vacatingDate),
      tailCalculatedSharePaise: tailShare,
      tailAlreadyCollectedPaise: tailCollected,
      tailRemainingPaise: tailRemainingForCurrent,
      finalizedInvoiceRemainingPaise: finalizedRemainingForCurrent,
      totalElectricityDeductionPaise: suggestedDepositDeductionPaise,
      calculatedSharePaise: tailShare,
      alreadyCollectedPaise: currentInvoicePaid + tailCollected,
      remainingPaise: residentTotalRemaining,
      depositDeductionPaise: suggestedDepositDeductionPaise,
    },
    suggestedDepositDeductionPaise,
  };
}

export function resolveCheckoutMeterOpeningUnits(input: {
  finalizedBillClosingUnits: number | null;
  chainOpeningUnits: number | null;
  settlementPreviousUnits: number | null;
}): number | null {
  if (input.finalizedBillClosingUnits != null) return input.finalizedBillClosingUnits;
  if (input.settlementPreviousUnits != null) return input.settlementPreviousUnits;
  return input.chainOpeningUnits;
}

export function activeOccupancyLabel(
  stayStart: string,
  stayEndExclusive: string | null,
  vacatingDate: string,
): string {
  const end = stayEndExclusive ?? vacatingExclusiveEnd(vacatingDate);
  return `${stayStart} → ${end}`;
}
