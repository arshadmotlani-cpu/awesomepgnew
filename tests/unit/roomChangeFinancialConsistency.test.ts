import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { postTransferBillingAnchorDate } from '@/src/lib/billing/postTransferRentPricing';
import { formatRoomChangeQuoteForDisplay } from '@/src/lib/roomTransfer/quoteDisplay';
import {
  roomChangeChargesSettledFromRows,
} from '@/src/services/roomTransferBilling';
import { ROOM_CHANGE_INVOICE_SOURCE, applyRoomShiftCreditWaterfall, ROOM_SHIFT_FEE_PAISE } from '@/src/services/roomShiftQuote';
import { depositLinkLedgerReason, invoiceDepositLedgerReason, parsePaymentsRelatedId } from '@/src/lib/payments/paymentsRelatedId';
import { buildLateFeeCountdown } from '@/src/lib/billing/lateFeeCountdown';
import { INVOICE_LATE_FEE_GRACE_DAYS } from '@/src/lib/billing/lateFeeSchedule';
import { PG_LATE_FEE_MAX_PERCENT_OF_PRINCIPAL } from '@/src/services/lateFeePolicyCore';

describe('room change financial consistency', () => {
  test('post-transfer billing anchor uses next month when transfer is month-end', () => {
    assert.equal(postTransferBillingAnchorDate('2026-08-31'), '2026-09-01');
    assert.equal(postTransferBillingAnchorDate('2026-08-15'), '2026-08-15');
  });

  test('APG-2026-0021 gross vs net new-bed rent display', () => {
    const waterfall = applyRoomShiftCreditWaterfall({
      oldRentDuePaise: 0,
      newRentChargePaise: 23_262,
      shiftFeePaise: ROOM_SHIFT_FEE_PAISE,
      depositTopUpPaise: 321_140,
      unusedPrepaidCreditPaise: 13_161,
    });
    const display = formatRoomChangeQuoteForDisplay({
      shiftDate: '2026-08-31',
      transferMode: 'immediate',
      transferLabel: 'Immediate',
      occupantCheckoutDate: null,
      expectedTransferDate: '2026-08-31',
      fromBedId: 'from',
      toBedId: 'to',
      oldMonthlyRentPaise: 408_000,
      newMonthlyRentPaise: 721_140,
      oldRentObligationPaise: 0,
      newRentChargePaise: 23_262,
      newRentDuePaise: waterfall.newRentDuePaise,
      oldRentDuePaise: 0,
      oldRentDueAfterCreditPaise: 0,
      unusedPrepaidCreditPaise: 13_161,
      depositHeldPaise: 400_000,
      depositRequiredPaise: 721_140,
      depositDeltaPaise: 321_140,
      depositDuePaise: waterfall.depositDuePaise,
      shiftFeePaise: ROOM_SHIFT_FEE_PAISE,
      feeDuePaise: waterfall.feeDuePaise,
      rentDeltaPaise: waterfall.newRentDuePaise,
      totalDuePaise: waterfall.totalDuePaise,
      walletSurplusPaise: waterfall.walletSurplusPaise,
      lines: [
        { label: 'New bed remaining rent', amountPaise: 23_262, kind: 'charge', section: 'new_room' },
      ],
      futureRentSchedule: [],
    });
    assert.equal(display.grossNewBedRentPaise, 23_262);
    assert.equal(display.netNewBedRentDuePaise, 19_101);
    assert.ok(display.summaryLines.some((l) => l.includes('Net due')));
  });

  test('deposit link provider id is not a payments UUID', () => {
    const linkId = '0d3e7d24-c6b7-474a-ac39-80f7e70e2990';
    assert.equal(parsePaymentsRelatedId(`deposit-link-proof-${linkId}`), null);
    assert.equal(depositLinkLedgerReason(linkId), `deposit-link:${linkId}`);
    assert.equal(
      invoiceDepositLedgerReason('b-1', 'req-1'),
      'invoice-deposit:b-1:req-1',
    );
  });

  test('room change charges not settled until all due children paid', () => {
    const requestId = 'req-1';
    const rows = [
      {
        sourceTable: ROOM_CHANGE_INVOICE_SOURCE.newRent,
        status: 'sent',
        amountPaise: 19_101,
      },
      {
        sourceTable: ROOM_CHANGE_INVOICE_SOURCE.deposit,
        status: 'paid',
        amountPaise: 321_140,
      },
    ];
    assert.equal(roomChangeChargesSettledFromRows(rows), false);

    rows[0].status = 'paid';
    assert.equal(roomChangeChargesSettledFromRows(rows), true);
  });

  test('pay-all marks charges settled', () => {
    const rows = [
      {
        sourceTable: ROOM_CHANGE_INVOICE_SOURCE.payAll,
        status: 'paid',
        amountPaise: 340_241,
      },
      {
        sourceTable: ROOM_CHANGE_INVOICE_SOURCE.deposit,
        status: 'sent',
        amountPaise: 321_140,
      },
    ];
    assert.equal(roomChangeChargesSettledFromRows(rows), true);
  });

  test('rent late fee grace is 5 days then 1% per day capped at 10%', () => {
    assert.equal(INVOICE_LATE_FEE_GRACE_DAYS, 5);
    assert.equal(PG_LATE_FEE_MAX_PERCENT_OF_PRINCIPAL, 10);
    const grace = buildLateFeeCountdown('2026-09-01', '2026-09-03');
    assert.equal(grace.phase, 'grace');
    const firstLateDay = buildLateFeeCountdown('2026-09-01', '2026-09-06');
    assert.equal(firstLateDay.phase, 'late');
    if (firstLateDay.phase === 'late') {
      assert.equal(firstLateDay.percentToday, 1);
    }
  });

  test('frozen quote deposit due unchanged at 321140', () => {
    const waterfall = applyRoomShiftCreditWaterfall({
      oldRentDuePaise: 0,
      newRentChargePaise: 23_262,
      shiftFeePaise: ROOM_SHIFT_FEE_PAISE,
      depositTopUpPaise: 321_140,
      unusedPrepaidCreditPaise: 13_161,
    });
    assert.equal(waterfall.depositDuePaise, 321_140);
    assert.equal(waterfall.totalDuePaise, 340_241);
  });
});
