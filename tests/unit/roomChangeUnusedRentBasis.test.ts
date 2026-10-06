import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRoomShiftCreditWaterfall,
  computeRoomChangeWalletSurplusPaise,
  resolveOldBedRentBasisForRoomShift,
  settleRoomShiftRentSides,
} from '@/src/services/roomShiftQuote';
import { ROOM_CHANGE_UNUSED_RENT_RECON_REASON } from '@/src/services/roomChangeUnusedRentReconciliation';

describe('resolveOldBedRentBasisForRoomShift', () => {
  it('paid month uses invoiced rent principal, not stale snapshot', () => {
    const basis = resolveOldBedRentBasisForRoomShift({
      canonicalOldBedMonthlyRentPaise: 550_000,
      snapshotFallbackPaise: 412_080,
      monthPay: {
        isPaid: true,
        paidPaise: 550_000,
        outstandingPaise: 0,
        invoicedPaise: 550_000,
      },
    });
    assert.equal(basis.basisSource, 'paid_month_invoice');
    assert.equal(basis.oldMonthlyRentPaise, 550_000);
  });

  it('unpaid month uses bed price SSOT', () => {
    const basis = resolveOldBedRentBasisForRoomShift({
      canonicalOldBedMonthlyRentPaise: 408_000,
      snapshotFallbackPaise: 412_080,
      monthPay: {
        isPaid: false,
        paidPaise: 0,
        outstandingPaise: 408_000,
        invoicedPaise: 408_000,
      },
    });
    assert.equal(basis.basisSource, 'bed_price_ssot');
    assert.equal(basis.oldMonthlyRentPaise, 408_000);
  });

  it('matching snapshot and paid invoice — same basis', () => {
    const basis = resolveOldBedRentBasisForRoomShift({
      canonicalOldBedMonthlyRentPaise: 412_080,
      snapshotFallbackPaise: 412_080,
      monthPay: {
        isPaid: true,
        paidPaise: 412_080,
        outstandingPaise: 0,
        invoicedPaise: 412_080,
      },
    });
    assert.equal(basis.oldMonthlyRentPaise, 412_080);
  });
});

describe('Sagar APG-2026-0112 shaped surplus', () => {
  const shiftDate = '2026-10-03';
  const newRent = 360_600;

  it('stale snapshot 412080 → surplus 48159 (legacy bug)', () => {
    const surplus = computeRoomChangeWalletSurplusPaise({
      shiftDate,
      oldMonthlyRentPaise: 412_080,
      newMonthlyRentPaise: newRent,
      currentMonthRentIsPaid: true,
      prepaidPrincipalCapPaise: 550_000,
      shiftFeePaise: 9_000,
      depositTopUpPaise: 0,
    });
    assert.equal(surplus, 48_159);
  });

  it('paid invoice basis 550000 → surplus 177181', () => {
    const basis = resolveOldBedRentBasisForRoomShift({
      canonicalOldBedMonthlyRentPaise: 550_000,
      snapshotFallbackPaise: 412_080,
      monthPay: {
        isPaid: true,
        paidPaise: 550_000,
        outstandingPaise: 0,
        invoicedPaise: 550_000,
      },
    });
    const surplus = computeRoomChangeWalletSurplusPaise({
      shiftDate,
      oldMonthlyRentPaise: basis.oldMonthlyRentPaise,
      newMonthlyRentPaise: newRent,
      currentMonthRentIsPaid: true,
      prepaidPrincipalCapPaise: basis.paidPrincipalPaise,
      shiftFeePaise: 9_000,
      depositTopUpPaise: 0,
    });
    assert.equal(surplus, 177_181);
    assert.equal(48_159 + 129_022, 177_181);
  });

  it('new-bed remainder 337335 unchanged between bases', () => {
    const sidesStale = settleRoomShiftRentSides({
      oldMonthlyRentPaise: 412_080,
      newMonthlyRentPaise: newRent,
      shiftDate,
      currentMonthRentIsPaid: true,
      prepaidPrincipalCapPaise: 550_000,
    });
    const sidesPaid = settleRoomShiftRentSides({
      oldMonthlyRentPaise: 550_000,
      newMonthlyRentPaise: newRent,
      shiftDate,
      currentMonthRentIsPaid: true,
      prepaidPrincipalCapPaise: 550_000,
    });
    assert.equal(sidesStale.newRemainderPaise, 337_335);
    assert.equal(sidesPaid.newRemainderPaise, 337_335);
  });
});

describe('partial prepaid cap', () => {
  it('does not create unused credit above principal prepaid', () => {
    const sides = settleRoomShiftRentSides({
      oldMonthlyRentPaise: 550_000,
      newMonthlyRentPaise: 360_600,
      shiftDate: '2026-10-03',
      currentMonthRentIsPaid: true,
      prepaidPrincipalCapPaise: 400_000,
    });
    assert.ok(sides.unusedPrepaidCreditPaise <= 400_000);
  });
});

describe('unpaid month', () => {
  it('does not allocate unused prepaid credit', () => {
    const sides = settleRoomShiftRentSides({
      oldMonthlyRentPaise: 550_000,
      newMonthlyRentPaise: 360_600,
      shiftDate: '2026-10-03',
      currentMonthRentIsPaid: false,
    });
    assert.equal(sides.unusedPrepaidCreditPaise, 0);
  });
});

describe('reconciliation reason idempotency key', () => {
  it('deterministic per room change id', () => {
    const id = '70dd0a1d-e381-4180-8e59-5c27c57a1651';
    assert.equal(
      ROOM_CHANGE_UNUSED_RENT_RECON_REASON(id),
      `room_change_unused_rent_reconciliation:${id}`,
    );
  });
});

describe('cheaper new bed move', () => {
  it('produces wallet surplus when prepaid exceeds new remainder + fee', () => {
    const sides = settleRoomShiftRentSides({
      oldMonthlyRentPaise: 760_000,
      newMonthlyRentPaise: 360_600,
      shiftDate: '2026-10-03',
      currentMonthRentIsPaid: true,
      prepaidPrincipalCapPaise: 760_000,
    });
    const wf = applyRoomShiftCreditWaterfall({
      oldRentDuePaise: sides.oldRentDuePaise,
      newRentChargePaise: sides.newRemainderPaise,
      shiftFeePaise: 9_000,
      depositTopUpPaise: 0,
      unusedPrepaidCreditPaise: sides.unusedPrepaidCreditPaise,
    });
    assert.ok(wf.walletSurplusPaise > 0);
    assert.equal(wf.newRentDuePaise, 0);
  });
});
