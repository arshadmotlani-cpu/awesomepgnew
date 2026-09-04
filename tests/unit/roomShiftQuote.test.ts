import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOM_SHIFT_FEE_PAISE,
  ROOM_CHANGE_INVOICE_SOURCE,
  applyRoomShiftCreditWaterfall,
  settleRoomShiftRentSides,
  occupiedBeforeShiftInBillingMonth,
  remainingInBillingMonth,
} from '@/src/services/roomShiftQuote';
import { roomChangeChargesSettledFromRows } from '@/src/services/roomTransferBilling';

test('room shift fee is ₹90', () => {
  assert.equal(ROOM_SHIFT_FEE_PAISE, 9_000);
});

test('settleRoomShiftRentSides — unpaid month charges old occupied rent only', () => {
  const shiftDate = '2026-08-15';
  const monthly = 30_000;
  const oldOccupied = occupiedBeforeShiftInBillingMonth(shiftDate, monthly);
  const result = settleRoomShiftRentSides({
    oldMonthlyRentPaise: monthly,
    newMonthlyRentPaise: 35_000,
    shiftDate,
    currentMonthRentIsPaid: false,
  });
  assert.equal(result.oldRentDuePaise, oldOccupied);
  assert.equal(result.unusedPrepaidCreditPaise, 0);
  assert.ok(result.newRemainderPaise > 0);
});

test('settleRoomShiftRentSides — paid month credits unused prepaid remainder', () => {
  const shiftDate = '2026-08-15';
  const monthly = 30_000;
  const result = settleRoomShiftRentSides({
    oldMonthlyRentPaise: monthly,
    newMonthlyRentPaise: 35_000,
    shiftDate,
    currentMonthRentIsPaid: true,
  });
  assert.equal(result.oldRentDuePaise, 0);
  assert.equal(
    result.unusedPrepaidCreditPaise,
    remainingInBillingMonth(shiftDate, monthly),
  );
});

test('applyRoomShiftCreditWaterfall — prepaid rent credit does not cover room-change fee', () => {
  const waterfall = applyRoomShiftCreditWaterfall({
    oldRentDuePaise: 5_000,
    newRentChargePaise: 10_000,
    shiftFeePaise: ROOM_SHIFT_FEE_PAISE,
    depositTopUpPaise: 0,
    unusedPrepaidCreditPaise: 12_000,
  });
  assert.equal(waterfall.feeDuePaise, ROOM_SHIFT_FEE_PAISE);
  assert.equal(waterfall.newRentDuePaise, 0);
  assert.equal(waterfall.oldRentDueAfterCreditPaise, 3_000);
  assert.equal(waterfall.creditAppliedPaise, 12_000);
  assert.equal(waterfall.totalDuePaise, ROOM_SHIFT_FEE_PAISE + 3_000);
});

test('applyRoomShiftCreditWaterfall — same-room equal rent leaves fee payable', () => {
  const remainder = 370_872;
  const waterfall = applyRoomShiftCreditWaterfall({
    oldRentDuePaise: 0,
    newRentChargePaise: remainder,
    shiftFeePaise: ROOM_SHIFT_FEE_PAISE,
    depositTopUpPaise: 0,
    unusedPrepaidCreditPaise: remainder,
  });
  assert.equal(waterfall.feeDuePaise, ROOM_SHIFT_FEE_PAISE);
  assert.equal(waterfall.newRentDuePaise, 0);
  assert.equal(waterfall.totalDuePaise, ROOM_SHIFT_FEE_PAISE);
  assert.equal(waterfall.walletSurplusPaise, 0);
});

test('applyRoomShiftCreditWaterfall — surplus goes to wallet after rent/deposit', () => {
  const waterfall = applyRoomShiftCreditWaterfall({
    oldRentDuePaise: 0,
    newRentChargePaise: 5_000,
    shiftFeePaise: ROOM_SHIFT_FEE_PAISE,
    depositTopUpPaise: 0,
    unusedPrepaidCreditPaise: 20_000,
  });
  assert.equal(waterfall.feeDuePaise, ROOM_SHIFT_FEE_PAISE);
  assert.equal(waterfall.newRentDuePaise, 0);
  assert.equal(waterfall.totalDuePaise, ROOM_SHIFT_FEE_PAISE);
  assert.equal(waterfall.walletSurplusPaise, 15_000);
});

test('roomChangeChargesSettledFromRows — pay-all paid satisfies all charges', () => {
  const settled = roomChangeChargesSettledFromRows([
    {
      sourceTable: ROOM_CHANGE_INVOICE_SOURCE.oldRent,
      status: 'sent',
      amountPaise: 5_000,
    },
    {
      sourceTable: ROOM_CHANGE_INVOICE_SOURCE.payAll,
      status: 'paid',
      amountPaise: 14_000,
    },
  ]);
  assert.equal(settled, true);
});

test('roomChangeChargesSettledFromRows — all children must be paid when no pay-all', () => {
  assert.equal(
    roomChangeChargesSettledFromRows([
      {
        sourceTable: ROOM_CHANGE_INVOICE_SOURCE.fee,
        status: 'paid',
        amountPaise: ROOM_SHIFT_FEE_PAISE,
      },
      {
        sourceTable: ROOM_CHANGE_INVOICE_SOURCE.newRent,
        status: 'sent',
        amountPaise: 10_000,
      },
    ]),
    false,
  );
  assert.equal(
    roomChangeChargesSettledFromRows([
      {
        sourceTable: ROOM_CHANGE_INVOICE_SOURCE.fee,
        status: 'paid',
        amountPaise: ROOM_SHIFT_FEE_PAISE,
      },
      {
        sourceTable: ROOM_CHANGE_INVOICE_SOURCE.newRent,
        status: 'paid',
        amountPaise: 10_000,
      },
    ]),
    true,
  );
});
