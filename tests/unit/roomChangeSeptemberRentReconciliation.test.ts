import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  applyRoomShiftCreditWaterfall,
  occupiedBeforeShiftInBillingMonth,
  remainingInBillingMonth,
  settleRoomShiftRentSides,
} from '@/src/services/roomShiftQuote';
import {
  previewRoomChangeRentReconciliation,
  reconcileRoomChangeRentInvoices,
} from '@/src/services/roomChangeRentReconciliation';

describe('September rent after cross-room change (unpaid month)', () => {
  test('Rishik APG-2026-0021 — 204→101 on 2026-09-04 resolves to ₹7,600 rent', () => {
    const oldMonthly = 408_000;
    const newMonthly = 760_000;
    const shiftDate = '2026-09-04';
    const sides = settleRoomShiftRentSides({
      oldMonthlyRentPaise: oldMonthly,
      newMonthlyRentPaise: newMonthly,
      shiftDate,
      currentMonthRentIsPaid: false,
    });
    assert.equal(sides.oldRentDuePaise, occupiedBeforeShiftInBillingMonth(shiftDate, oldMonthly));
    assert.equal(sides.newRemainderPaise, newMonthly - sides.oldOccupiedPaise);
    assert.equal(sides.oldRentDuePaise + sides.newRemainderPaise, newMonthly);

    const waterfall = applyRoomShiftCreditWaterfall({
      oldRentDuePaise: sides.oldRentDuePaise,
      newRentChargePaise: sides.newRemainderPaise,
      shiftFeePaise: 9_000,
      depositTopUpPaise: 38_860,
      unusedPrepaidCreditPaise: 0,
    });
    assert.equal(waterfall.oldRentDueAfterCreditPaise, sides.oldRentDuePaise);
    assert.equal(waterfall.newRentDuePaise, sides.newRemainderPaise);
    assert.equal(waterfall.feeDuePaise, 9_000);
    assert.equal(waterfall.depositDuePaise, 38_860);
    assert.equal(
      waterfall.oldRentDueAfterCreditPaise + waterfall.newRentDuePaise,
      760_000,
    );
    assert.equal(
      waterfall.totalDuePaise,
      760_000 + 9_000 + 38_860,
    );
  });

  test('same monthly rate — unpaid month still sums to full month', () => {
    const monthly = 760_000;
    const shiftDate = '2026-09-04';
    const sides = settleRoomShiftRentSides({
      oldMonthlyRentPaise: monthly,
      newMonthlyRentPaise: monthly,
      shiftDate,
      currentMonthRentIsPaid: false,
    });
    assert.equal(
      sides.newRemainderPaise,
      remainingInBillingMonth(shiftDate, monthly),
    );
    assert.equal(sides.oldRentDuePaise + sides.newRemainderPaise, monthly);
  });

  test('paid month — new remainder stays prorated at new rate; prepaid credit separate', () => {
    const shiftDate = '2026-09-04';
    const sides = settleRoomShiftRentSides({
      oldMonthlyRentPaise: 412_080,
      newMonthlyRentPaise: 760_000,
      shiftDate,
      currentMonthRentIsPaid: true,
    });
    assert.equal(sides.oldRentDuePaise, 0);
    assert.equal(sides.newRemainderPaise, remainingInBillingMonth(shiftDate, 760_000));
    assert.ok(sides.unusedPrepaidCreditPaise > 0);
  });

  test('prepaid credit waterfall never erases room-change fee', () => {
    const waterfall = applyRoomShiftCreditWaterfall({
      oldRentDuePaise: 40_800,
      newRentChargePaise: 719_200,
      shiftFeePaise: 9_000,
      depositTopUpPaise: 38_860,
      unusedPrepaidCreditPaise: 100_000,
    });
    assert.equal(waterfall.feeDuePaise, 9_000);
    assert.ok(waterfall.totalDuePaise >= 9_000);
  });

  test('reconciliation service is generic — no booking-code hardcoding', () => {
    assert.match(
      String(previewRoomChangeRentReconciliation),
      /quoteSnapshot/,
    );
    assert.doesNotMatch(
      String(reconcileRoomChangeRentInvoices),
      /APG-2026-0021/,
    );
  });
});
