/**
 * Room shift quote engine — SSOT for resident room change pricing.
 * Calendar-month proration uses billing.prorateForMonth (same helper as move-out).
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { rentInvoices } from '@/src/db/schema';
import { parseDate, formatDate, addDays } from '@/src/lib/dates';
import { billingDayFromMoveIn, firstOfMonth, prorateForMonth } from '@/src/services/billing';
import { projectInvoice } from '@/src/services/rentInvoices';
import { computeMonthlyDepositPaise, loadBedPrice } from '@/src/services/pricing';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import type { TransferAvailabilityScenario } from '@/src/lib/roomTransfer/transferAvailability';

export const ROOM_SHIFT_FEE_PAISE = 9_000; // ₹90

export const ROOM_CHANGE_INVOICE_SOURCE = {
  oldRent: 'room_change_old_rent',
  newRent: 'room_change_new_rent',
  fee: 'room_change_fee',
  deposit: 'room_change_deposit',
  payAll: 'room_change_pay_all',
} as const;

export type RoomShiftQuoteLine = {
  label: string;
  amountPaise: number;
  kind: 'credit' | 'charge';
  section: 'old_room' | 'new_room' | 'deposit' | 'fee' | 'credit' | 'total';
};

export type RoomShiftQuoteSnapshot = {
  shiftDate: string;
  transferMode: 'immediate' | 'scheduled' | 'waitlist';
  transferLabel: 'Immediate' | 'Scheduled' | 'Waitlist';
  occupantCheckoutDate?: string;
  expectedTransferDate: string;
  fromBedId: string;
  toBedId: string;
  toPgId?: string | null;
  toPgName?: string | null;
  toRoomNumber?: string | null;
  toBedCode?: string | null;
  fromRoomLabel?: string | null;
  oldMonthlyRentPaise: number;
  newMonthlyRentPaise: number;
  oldRentObligationPaise: number;
  oldRentPaidPaise: number;
  oldRentUnpaidPaise: number;
  currentMonthRentIsPaid: boolean;
  unusedRentCreditPaise: number;
  unusedPrepaidCreditPaise: number;
  newRentChargePaise: number;
  rentDeltaPaise: number;
  depositHeldPaise: number;
  depositRequiredPaise: number;
  depositDeltaPaise: number;
  shiftFeePaise: number;
  feeDuePaise: number;
  newRentDuePaise: number;
  oldRentDueAfterCreditPaise: number;
  depositDuePaise: number;
  creditAppliedPaise: number;
  walletSurplusPaise: number;
  electricityAdjustmentPaise: number;
  totalDuePaise: number;
  nextCycleStart: string;
  futureRentSchedule: Array<{ month: string; amountPaise: number }>;
  lines: RoomShiftQuoteLine[];
  invoiceIds?: Partial<Record<keyof typeof ROOM_CHANGE_INVOICE_SOURCE, string>>;
};

function monthEndExclusive(dateStr: string): string {
  const d = parseDate(dateStr);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0));
  return formatDate(addDays(lastDay, 1));
}

/** Days in the destination bed this month: [shiftDate, nextMonth). */
export function remainingInBillingMonth(shiftDate: string, monthlyRentPaise: number): number {
  const billingMonth = firstOfMonth(shiftDate);
  const monthEnd = monthEndExclusive(shiftDate);
  const result = prorateForMonth({
    monthlyRatePaise: monthlyRentPaise,
    billingMonth,
    activeStart: shiftDate,
    activeEnd: monthEnd,
  });
  return result.amountPaise;
}

/** Days in the old bed this month: [monthStart, shiftDate). */
export function occupiedBeforeShiftInBillingMonth(
  shiftDate: string,
  monthlyRentPaise: number,
): number {
  const billingMonth = firstOfMonth(shiftDate);
  const result = prorateForMonth({
    monthlyRatePaise: monthlyRentPaise,
    billingMonth,
    activeStart: billingMonth,
    activeEnd: shiftDate,
  });
  return result.amountPaise;
}

export function settleRoomShiftRentSides(input: {
  oldMonthlyRentPaise: number;
  newMonthlyRentPaise: number;
  shiftDate: string;
  currentMonthRentIsPaid: boolean;
}): {
  oldOccupiedPaise: number;
  newRemainderPaise: number;
  unusedPrepaidCreditPaise: number;
  oldRentDuePaise: number;
} {
  const oldOccupiedPaise = occupiedBeforeShiftInBillingMonth(
    input.shiftDate,
    input.oldMonthlyRentPaise,
  );
  const newRemainderPaise = remainingInBillingMonth(
    input.shiftDate,
    input.newMonthlyRentPaise,
  );
  if (input.currentMonthRentIsPaid) {
    return {
      oldOccupiedPaise,
      newRemainderPaise,
      unusedPrepaidCreditPaise: remainingInBillingMonth(
        input.shiftDate,
        input.oldMonthlyRentPaise,
      ),
      oldRentDuePaise: 0,
    };
  }
  return {
    oldOccupiedPaise,
    newRemainderPaise,
    unusedPrepaidCreditPaise: 0,
    oldRentDuePaise: oldOccupiedPaise,
  };
}

/** Apply unused prepaid credit: fee → new rent → old rent → deposit. Surplus → wallet. */
export function applyRoomShiftCreditWaterfall(input: {
  oldRentDuePaise: number;
  newRentChargePaise: number;
  shiftFeePaise: number;
  depositTopUpPaise: number;
  unusedPrepaidCreditPaise: number;
}): {
  feeDuePaise: number;
  newRentDuePaise: number;
  oldRentDueAfterCreditPaise: number;
  depositDuePaise: number;
  creditAppliedPaise: number;
  walletSurplusPaise: number;
  totalDuePaise: number;
} {
  let credit = Math.max(0, input.unusedPrepaidCreditPaise);
  const start = credit;

  const take = (due: number): number => {
    const apply = Math.min(due, credit);
    credit -= apply;
    return due - apply;
  };

  const feeDuePaise = take(Math.max(0, input.shiftFeePaise));
  const newRentDuePaise = take(Math.max(0, input.newRentChargePaise));
  const oldRentDueAfterCreditPaise = take(Math.max(0, input.oldRentDuePaise));
  const depositDuePaise = take(Math.max(0, input.depositTopUpPaise));

  return {
    feeDuePaise,
    newRentDuePaise,
    oldRentDueAfterCreditPaise,
    depositDuePaise,
    creditAppliedPaise: start - credit,
    walletSurplusPaise: credit,
    totalDuePaise: feeDuePaise + newRentDuePaise + oldRentDueAfterCreditPaise + depositDuePaise,
  };
}

export function requiresAdminApprovalForTransfer(
  mode: 'immediate' | 'scheduled' | 'waitlist',
): boolean {
  return mode === 'waitlist';
}

export async function loadCurrentMonthRentPaid(bookingId: string, shiftDate: string): Promise<{
  isPaid: boolean;
  paidPaise: number;
  outstandingPaise: number;
  invoicedPaise: number;
}> {
  const billingMonth = firstOfMonth(shiftDate);
  const rows = await db
    .select()
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, bookingId),
        eq(rentInvoices.billingMonth, billingMonth),
        inArray(rentInvoices.status, ['pending', 'overdue', 'paid', 'payment_in_progress']),
      ),
    );
  if (rows.length === 0) {
    return { isPaid: false, paidPaise: 0, outstandingPaise: 0, invoicedPaise: 0 };
  }
  let paidPaise = 0;
  let outstandingPaise = 0;
  let invoicedPaise = 0;
  for (const row of rows) {
    const projected = projectInvoice(row);
    invoicedPaise += row.rentPaise;
    paidPaise += row.paidPrincipalPaise;
    outstandingPaise += projected.outstandingPaise;
  }
  return {
    isPaid: outstandingPaise <= 0 && paidPaise > 0,
    paidPaise,
    outstandingPaise,
    invoicedPaise,
  };
}

export async function computeRoomShiftQuote(input: {
  fromBedId: string;
  toBedId: string;
  shiftDate?: string;
  oldMonthlyRentPaise: number;
  depositHeldPaise: number;
  moveInDate: string;
  scenario: TransferAvailabilityScenario;
  bookingId?: string;
  fromRoomLabel?: string | null;
  toPgId?: string | null;
  toPgName?: string | null;
  toRoomNumber?: string | null;
  toBedCode?: string | null;
}): Promise<RoomShiftQuoteSnapshot> {
  const shiftDate = input.shiftDate ?? input.scenario.expectedTransferDate;
  const newPrice = await loadBedPrice(input.toBedId, shiftDate);
  if (!newPrice) {
    throw new Error('Could not load pricing for target bed.');
  }
  const newMonthlyRentPaise = newPrice.monthlyRatePaise;
  const newDepositRequired = computeMonthlyDepositPaise(newPrice);

  let currentMonthRentIsPaid = false;
  let oldRentPaidPaise = 0;
  if (input.bookingId) {
    const monthPay = await loadCurrentMonthRentPaid(input.bookingId, shiftDate);
    currentMonthRentIsPaid = monthPay.isPaid;
    oldRentPaidPaise = monthPay.paidPaise;
  }

  const sides = settleRoomShiftRentSides({
    oldMonthlyRentPaise: input.oldMonthlyRentPaise,
    newMonthlyRentPaise,
    shiftDate,
    currentMonthRentIsPaid,
  });

  const depositDeltaPaise = Math.max(0, newDepositRequired - input.depositHeldPaise);
  const waterfall = applyRoomShiftCreditWaterfall({
    oldRentDuePaise: sides.oldRentDuePaise,
    newRentChargePaise: sides.newRemainderPaise,
    shiftFeePaise: ROOM_SHIFT_FEE_PAISE,
    depositTopUpPaise: depositDeltaPaise,
    unusedPrepaidCreditPaise: sides.unusedPrepaidCreditPaise,
  });

  const billingDay = billingDayFromMoveIn(input.moveInDate);
  const futureRentSchedule: Array<{ month: string; amountPaise: number }> = [];
  let cursor = parseDate(shiftDate);
  for (let i = 0; i < 3; i++) {
    const month = formatDate(cursor).slice(0, 7) + '-01';
    futureRentSchedule.push({ month, amountPaise: newMonthlyRentPaise });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, billingDay));
  }

  const lines: RoomShiftQuoteLine[] = [];
  if (currentMonthRentIsPaid && oldRentPaidPaise > 0) {
    lines.push({
      label: 'Rent already paid (current month)',
      amountPaise: oldRentPaidPaise,
      kind: 'charge',
      section: 'old_room',
    });
  }
  if (sides.oldRentDuePaise > 0) {
    lines.push({
      label: 'Outstanding old-room rent (through transfer date)',
      amountPaise: sides.oldRentDuePaise,
      kind: 'charge',
      section: 'old_room',
    });
  }
  if (sides.unusedPrepaidCreditPaise > 0) {
    lines.push({
      label: 'Unused prepaid rent',
      amountPaise: sides.unusedPrepaidCreditPaise,
      kind: 'credit',
      section: 'old_room',
    });
  }
  if (sides.newRemainderPaise > 0) {
    lines.push({
      label: 'New bed remaining rent',
      amountPaise: sides.newRemainderPaise,
      kind: 'charge',
      section: 'new_room',
    });
  }
  if (depositDeltaPaise > 0) {
    lines.push({
      label: 'Additional deposit',
      amountPaise: depositDeltaPaise,
      kind: 'charge',
      section: 'deposit',
    });
  }
  lines.push({
    label: 'Room change fee',
    amountPaise: ROOM_SHIFT_FEE_PAISE,
    kind: 'charge',
    section: 'fee',
  });
  if (waterfall.creditAppliedPaise > 0) {
    lines.push({
      label: 'Credit',
      amountPaise: waterfall.creditAppliedPaise,
      kind: 'credit',
      section: 'credit',
    });
  }

  return {
    shiftDate,
    transferMode: input.scenario.mode,
    transferLabel: input.scenario.label,
    occupantCheckoutDate: input.scenario.occupantCheckoutDate,
    expectedTransferDate: input.scenario.expectedTransferDate,
    fromBedId: input.fromBedId,
    toBedId: input.toBedId,
    toPgId: input.toPgId,
    toPgName: input.toPgName,
    toRoomNumber: input.toRoomNumber,
    toBedCode: input.toBedCode,
    fromRoomLabel: input.fromRoomLabel,
    oldMonthlyRentPaise: input.oldMonthlyRentPaise,
    newMonthlyRentPaise,
    oldRentObligationPaise: sides.oldOccupiedPaise,
    oldRentPaidPaise,
    oldRentUnpaidPaise: currentMonthRentIsPaid ? 0 : sides.oldRentDuePaise,
    currentMonthRentIsPaid,
    unusedRentCreditPaise: sides.unusedPrepaidCreditPaise,
    unusedPrepaidCreditPaise: sides.unusedPrepaidCreditPaise,
    newRentChargePaise: sides.newRemainderPaise,
    rentDeltaPaise: waterfall.newRentDuePaise,
    depositHeldPaise: input.depositHeldPaise,
    depositRequiredPaise: newDepositRequired,
    depositDeltaPaise,
    shiftFeePaise: ROOM_SHIFT_FEE_PAISE,
    feeDuePaise: waterfall.feeDuePaise,
    newRentDuePaise: waterfall.newRentDuePaise,
    oldRentDueAfterCreditPaise: waterfall.oldRentDueAfterCreditPaise,
    depositDuePaise: waterfall.depositDuePaise,
    creditAppliedPaise: waterfall.creditAppliedPaise,
    walletSurplusPaise: waterfall.walletSurplusPaise,
    electricityAdjustmentPaise: 0,
    totalDuePaise: waterfall.totalDuePaise,
    nextCycleStart: shiftDate,
    futureRentSchedule,
    lines,
  };
}

export async function depositHeldForBooking(bookingId: string): Promise<number> {
  const deposit = await getDepositSummaryForBooking(bookingId);
  return deposit?.refundableBalancePaise ?? 0;
}
