/**
 * Room shift quote engine — SSOT for resident room change pricing.
 */

import { todayString, parseDate, formatDate, addDays } from '@/src/lib/dates';
import { billingDayFromMoveIn, prorateForMonth } from '@/src/services/billing';
import { computeMonthlyDepositPaise } from '@/src/lib/pricing/depositRules';
import { loadBedPrice } from '@/src/services/pricing';

export const ROOM_SHIFT_FEE_PAISE = 10_000; // ₹100

export type RoomShiftQuoteLine = {
  label: string;
  amountPaise: number;
  kind: 'credit' | 'charge';
};

export type RoomShiftQuoteSnapshot = {
  shiftDate: string;
  fromBedId: string;
  toBedId: string;
  oldMonthlyRentPaise: number;
  newMonthlyRentPaise: number;
  unusedRentCreditPaise: number;
  newRentChargePaise: number;
  rentDeltaPaise: number;
  depositDeltaPaise: number;
  shiftFeePaise: number;
  electricityAdjustmentPaise: number;
  totalDuePaise: number;
  nextCycleStart: string;
  futureRentSchedule: Array<{ month: string; amountPaise: number }>;
  lines: RoomShiftQuoteLine[];
};

function monthEndExclusive(dateStr: string): string {
  const d = parseDate(dateStr);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0));
  return formatDate(addDays(lastDay, 1));
}

function remainingInBillingMonth(shiftDate: string, monthlyRentPaise: number): number {
  const billingMonth = shiftDate.slice(0, 7) + '-01';
  const monthEnd = monthEndExclusive(shiftDate);
  const result = prorateForMonth({
    monthlyRatePaise: monthlyRentPaise,
    billingMonth,
    activeStart: shiftDate,
    activeEnd: monthEnd,
  });
  return result.amountPaise;
}

export async function computeRoomShiftQuote(input: {
  fromBedId: string;
  toBedId: string;
  shiftDate?: string;
  oldMonthlyRentPaise: number;
  depositHeldPaise: number;
  moveInDate: string;
}): Promise<RoomShiftQuoteSnapshot> {
  const shiftDate = input.shiftDate ?? todayString();
  const newPrice = await loadBedPrice(input.toBedId, shiftDate);
  if (!newPrice) {
    throw new Error('Could not load pricing for target bed.');
  }
  const newMonthlyRentPaise = newPrice.monthlyRatePaise;
  const newDepositRequired = computeMonthlyDepositPaise({
    monthlyRatePaise: newMonthlyRentPaise,
    monthlySecurityDepositPaise: newPrice.monthlySecurityDepositPaise ?? undefined,
  });

  const unusedRentCreditPaise = remainingInBillingMonth(shiftDate, input.oldMonthlyRentPaise);
  const newRentChargePaise = remainingInBillingMonth(shiftDate, newMonthlyRentPaise);
  const rentDeltaPaise = Math.max(0, newRentChargePaise - unusedRentCreditPaise);
  const depositDeltaPaise = Math.max(0, newDepositRequired - input.depositHeldPaise);
  const electricityAdjustmentPaise = 0; // Applied at admin execution when bill exists

  const totalDuePaise =
    rentDeltaPaise + depositDeltaPaise + ROOM_SHIFT_FEE_PAISE + electricityAdjustmentPaise;

  const billingDay = billingDayFromMoveIn(input.moveInDate);
  const nextCycleStart = shiftDate;

  const futureRentSchedule: Array<{ month: string; amountPaise: number }> = [];
  let cursor = parseDate(shiftDate);
  for (let i = 0; i < 3; i++) {
    const month = formatDate(cursor).slice(0, 7) + '-01';
    futureRentSchedule.push({ month, amountPaise: newMonthlyRentPaise });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, billingDay));
  }

  const lines: RoomShiftQuoteLine[] = [];
  if (unusedRentCreditPaise > 0) {
    lines.push({
      label: 'Unused rent credit (current bed)',
      amountPaise: unusedRentCreditPaise,
      kind: 'credit',
    });
  }
  if (newRentChargePaise > 0) {
    lines.push({
      label: 'New bed rent (remainder of month)',
      amountPaise: newRentChargePaise,
      kind: 'charge',
    });
  }
  if (depositDeltaPaise > 0) {
    lines.push({ label: 'Deposit top-up', amountPaise: depositDeltaPaise, kind: 'charge' });
  }
  lines.push({ label: 'Room shift fee', amountPaise: ROOM_SHIFT_FEE_PAISE, kind: 'charge' });

  return {
    shiftDate,
    fromBedId: input.fromBedId,
    toBedId: input.toBedId,
    oldMonthlyRentPaise: input.oldMonthlyRentPaise,
    newMonthlyRentPaise,
    unusedRentCreditPaise,
    newRentChargePaise,
    rentDeltaPaise,
    depositDeltaPaise,
    shiftFeePaise: ROOM_SHIFT_FEE_PAISE,
    electricityAdjustmentPaise,
    totalDuePaise,
    nextCycleStart,
    futureRentSchedule,
    lines,
  };
}
