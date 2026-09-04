import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isSameRoomBedChangeFromLabels,
  isSimpleRoomChangeFeeReview,
  paymentReviewPurposeLabel,
  resolvePaymentReviewPurpose,
} from '@/src/lib/payments/paymentReviewPurpose';
import { ROOM_CHANGE_INVOICE_SOURCE, ROOM_SHIFT_FEE_PAISE } from '@/src/services/roomShiftQuote';
import { readFileSync } from 'node:fs';

describe('payment review purpose — room-change vs deposit', () => {
  test('1 — same-room B3→B1 ₹90 → ROOM_CHANGE_FEE / Bed Change Fee', () => {
    const purpose = resolvePaymentReviewPurpose({
      kind: 'deposit_link',
      amountPaise: ROOM_SHIFT_FEE_PAISE,
      invoiceType: 'room_shift',
      invoiceNotes: 'New-room remaining rent',
      invoiceSourceTable: ROOM_CHANGE_INVOICE_SOURCE.newRent,
      paymentLinkPurpose: 'combined',
      roomChange: {
        sameRoom: true,
        shiftFeePaise: ROOM_SHIFT_FEE_PAISE,
        feeDuePaise: 0, // historical mis-bucket
        newRentDuePaise: ROOM_SHIFT_FEE_PAISE,
        depositDuePaise: 0,
        oldRentDuePaise: 0,
        totalDuePaise: ROOM_SHIFT_FEE_PAISE,
      },
    });
    assert.equal(purpose.purpose, 'ROOM_CHANGE_FEE');
    assert.equal(purpose.label, 'Bed Change Fee');
    assert.equal(purpose.showRoomChangeWaterfall, false);
    assert.equal(purpose.sameRoomBedChange, true);
  });

  test('2 — payment-review purpose = ROOM_CHANGE_FEE', () => {
    assert.equal(paymentReviewPurposeLabel('ROOM_CHANGE_FEE', { sameRoomBedChange: true }), 'Bed Change Fee');
    assert.equal(paymentReviewPurposeLabel('ROOM_CHANGE_FEE'), 'Room Change Fee');
  });

  test('3 — UI must not label room-change fee as Deposit Collection', () => {
    const purpose = resolvePaymentReviewPurpose({
      kind: 'deposit_link',
      amountPaise: ROOM_SHIFT_FEE_PAISE,
      invoiceType: 'room_shift',
      invoiceSourceTable: ROOM_CHANGE_INVOICE_SOURCE.fee,
      paymentLinkPurpose: 'combined',
      roomChange: {
        sameRoom: true,
        feeDuePaise: ROOM_SHIFT_FEE_PAISE,
        newRentDuePaise: 0,
        depositDuePaise: 0,
        totalDuePaise: ROOM_SHIFT_FEE_PAISE,
      },
    });
    assert.notEqual(purpose.label, 'Deposit Collection');
    assert.notEqual(purpose.purpose, 'DEPOSIT_COLLECTION');
  });

  test('4 — simple same-room fee hides waterfall', () => {
    assert.equal(
      isSimpleRoomChangeFeeReview({
        amountPaise: ROOM_SHIFT_FEE_PAISE,
        sameRoom: true,
        totalDuePaise: ROOM_SHIFT_FEE_PAISE,
        feeDuePaise: 0,
        newRentDuePaise: ROOM_SHIFT_FEE_PAISE,
        depositDuePaise: 0,
      }),
      true,
    );
  });

  test('9 — real deposit payment still shows Deposit Collection', () => {
    const purpose = resolvePaymentReviewPurpose({
      kind: 'deposit_link',
      amountPaise: 321_140,
      invoiceType: 'deposit',
      paymentLinkPurpose: 'deposit',
    });
    assert.equal(purpose.purpose, 'DEPOSIT_COLLECTION');
    assert.equal(purpose.label, 'Deposit Collection');
    assert.equal(purpose.showRoomChangeWaterfall, false);
  });

  test('10 — real rent payment still shows Rent', () => {
    const purpose = resolvePaymentReviewPurpose({
      kind: 'rent',
      amountPaise: 412_000,
    });
    assert.equal(purpose.purpose, 'RENT');
    assert.equal(purpose.label, 'Rent');
  });

  test('11 — real electricity payment still shows Electricity', () => {
    const purpose = resolvePaymentReviewPurpose({
      kind: 'electricity',
      amountPaise: 26_200,
    });
    assert.equal(purpose.purpose, 'ELECTRICITY');
    assert.equal(purpose.label, 'Electricity');
  });

  test('12 — different-room rent difference keeps settlement waterfall', () => {
    const purpose = resolvePaymentReviewPurpose({
      kind: 'deposit_link',
      amountPaise: 340_241,
      invoiceType: 'room_shift',
      invoiceSourceTable: ROOM_CHANGE_INVOICE_SOURCE.payAll,
      paymentLinkPurpose: 'combined',
      roomChange: {
        sameRoom: false,
        shiftFeePaise: ROOM_SHIFT_FEE_PAISE,
        feeDuePaise: ROOM_SHIFT_FEE_PAISE,
        newRentDuePaise: 10_101,
        depositDuePaise: 321_140,
        oldRentDuePaise: 0,
        totalDuePaise: 340_241,
      },
    });
    assert.equal(purpose.purpose, 'ROOM_CHANGE_SETTLEMENT');
    assert.equal(purpose.showRoomChangeWaterfall, true);
    assert.equal(purpose.label, 'Room Change Settlement');
  });

  test('13 — deposit difference remains settlement (not simple fee)', () => {
    const purpose = resolvePaymentReviewPurpose({
      kind: 'deposit_link',
      amountPaise: 50_000,
      invoiceType: 'deposit',
      invoiceSourceTable: ROOM_CHANGE_INVOICE_SOURCE.deposit,
      paymentLinkPurpose: 'combined',
      roomChange: {
        sameRoom: false,
        feeDuePaise: ROOM_SHIFT_FEE_PAISE,
        newRentDuePaise: 0,
        depositDuePaise: 50_000,
        totalDuePaise: ROOM_SHIFT_FEE_PAISE + 50_000,
      },
    });
    // Amount is deposit top-up only, not the ₹90 fee → not simple fee.
    assert.notEqual(purpose.purpose, 'ROOM_CHANGE_FEE');
  });

  test('same-room label detection from R204 → 204', () => {
    assert.equal(
      isSameRoomBedChangeFromLabels({
        fromRoomLabel: 'SHANTINAGAR - AWESOME PG · R204',
        toRoomNumber: '204',
      }),
      true,
    );
    assert.equal(
      isSameRoomBedChangeFromLabels({
        fromRoomLabel: 'SHANTINAGAR - AWESOME PG · R204',
        toRoomNumber: '301',
      }),
      false,
    );
  });

  test('15 — no resident-specific logic in purpose module', () => {
    const src = readFileSync('src/lib/payments/paymentReviewPurpose.ts', 'utf8');
    assert.doesNotMatch(src, /APG-2026-0096|Reetik|khandekar/i);
  });

  test('workspace hides waterfall for ROOM_CHANGE_FEE', () => {
    const workspace = readFileSync(
      'src/components/admin/payment-review/PaymentReviewWorkspace.tsx',
      'utf8',
    );
    assert.match(workspace, /showRoomChangeWaterfall/);
    assert.match(workspace, /Bed Change Fee|paymentPurpose\.label/);
    assert.match(workspace, /isSimpleBedChangeFee/);
  });
});
