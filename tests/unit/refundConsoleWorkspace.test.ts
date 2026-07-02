import assert from 'node:assert/strict';
import test from 'node:test';
import { toRefundConsoleWorkspaceDTO } from '@/src/lib/refund/refundConsoleDto';
import { refundConsoleHref } from '@/src/lib/refund/refundConsoleLinks';
import { parseOperationsFilter } from '@/src/lib/operations/operationsFilterLinks';
import { emptyRefundConsoleWallet } from '@/src/services/refundConsole';

test('refund console deep link uses booking query param only', () => {
  assert.equal(refundConsoleHref('abc-123'), '/admin/refunds?booking=abc-123');
  assert.doesNotMatch(refundConsoleHref('abc-123'), /q=/);
});

test('refund filter maps to refund_due queue', () => {
  assert.equal(parseOperationsFilter('refund'), 'refund_due');
});

test('refund workspace DTO serializes dates for client components', () => {
  const occurredAt = new Date('2026-01-15T10:30:00.000Z');
  const dto = toRefundConsoleWorkspaceDTO({
    bookingId: 'b1',
    bookingCode: 'BK-1',
    customerId: 'c1',
    customerName: 'Test',
    customerPhone: '999',
    pgName: 'PG',
    bedLabel: 'Room 1',
    status: 'checked_out',
    checkInDate: '2025-01-01',
    checkOutDate: '2026-01-01',
    vacatingDate: '2026-01-15',
    adminDepositRefundStatus: null,
    wallet: {
      depositPaidPaise: 100000,
      depositUsedPaise: 0,
      depositTransferredPaise: 0,
      electricityDeductionPaise: 0,
      policyDeductionPaise: 0,
      otherDeductionsPaise: 0,
      refundPaidPaise: 0,
      remainingDepositPaise: 100000,
    },
    ledger: [
      {
        id: 'ledger-1',
        bookingId: 'b1',
        customerId: 'c1',
        entryKind: 'collected',
        amountPaise: 100000,
        reason: 'Paid at move-in',
        deductionCategory: null,
        relatedPaymentId: null,
        relatedVacatingId: null,
        createdByAdminId: null,
        createdAt: occurredAt,
      },
    ],
    deductions: [{ id: 'd1', amountPaise: 5000, reason: 'Damage', category: 'other', occurredAt }],
    transfers: [{ id: 't1', amountPaise: 2000, reason: 'Transfer', occurredAt }],
    timeline: [
      {
        id: 'e1',
        label: 'Deposit collected',
        detail: 'Paid at move-in',
        amountPaise: 100000,
        occurredAt,
      },
    ],
    checkout: {
      settlementId: 's1',
      status: 'refund_pending',
      finalRefundPaise: 95000,
      payoutUpiId: 'test@upi',
      payoutQrUrl: 'https://example.com/qr.png',
      meterPhotoUrl: 'https://example.com/meter.png',
      noticeDeductionPaise: 0,
      electricitySharePaise: 5000,
      damageChargePaise: 0,
      cleaningChargePaise: 0,
      customChargePaise: 0,
      customChargeLabel: null,
      vacatingRequestId: 'v1',
      canMarkPaid: true,
    },
    suggestedRefundPaise: 95000,
    refundableBalancePaise: 95000,
  });

  assert.equal(typeof dto.deductions[0]!.occurredAt, 'string');
  assert.equal(typeof dto.timeline[0]!.occurredAt, 'string');
  assert.equal(dto.vacatingDate, '2026-01-15');
  assert.equal(dto.checkout?.settlementHref, '/admin/checkout-settlements/s1');
  assert.equal('ledger' in dto, false);
  assert.doesNotThrow(() => JSON.stringify(dto));
});

test('refund workspace DTO serializes Date fields for client components', () => {
  const dto = toRefundConsoleWorkspaceDTO({
    bookingId: 'b1',
    bookingCode: 'BK-1',
    customerId: 'c1',
    customerName: 'Test',
    customerPhone: '999',
    pgName: 'PG',
    bedLabel: 'Room 1',
    status: 'checked_out',
    checkInDate: new Date('2025-06-01T00:00:00.000Z'),
    checkOutDate: new Date('2026-06-01T00:00:00.000Z'),
    vacatingDate: new Date('2026-05-15T00:00:00.000Z'),
    adminDepositRefundStatus: null,
    wallet: emptyRefundConsoleWallet(),
    ledger: [],
    deductions: [],
    transfers: [],
    timeline: [],
    checkout: null,
    suggestedRefundPaise: 0,
    refundableBalancePaise: 0,
  });

  assert.equal(dto.checkInDate, '2025-06-01');
  assert.equal(dto.checkOutDate, '2026-06-01');
  assert.equal(dto.vacatingDate, '2026-05-15');
  assert.doesNotThrow(() => JSON.stringify(dto));
});

test('empty refund wallet is all zeros', () => {
  const wallet = emptyRefundConsoleWallet();
  assert.deepEqual(wallet, {
    depositPaidPaise: 0,
    depositUsedPaise: 0,
    depositTransferredPaise: 0,
    electricityDeductionPaise: 0,
    policyDeductionPaise: 0,
    otherDeductionsPaise: 0,
    refundPaidPaise: 0,
    remainingDepositPaise: 0,
  });
});

test('empty workspace DTO round-trips through JSON', () => {
  const dto = toRefundConsoleWorkspaceDTO({
    bookingId: 'b-empty',
    bookingCode: 'BK-EMPTY',
    customerId: 'c-empty',
    customerName: 'Empty Resident',
    customerPhone: null,
    pgName: null,
    bedLabel: null,
    status: 'confirmed',
    checkInDate: null,
    checkOutDate: null,
    vacatingDate: null,
    adminDepositRefundStatus: null,
    wallet: emptyRefundConsoleWallet(),
    ledger: [],
    deductions: [],
    transfers: [],
    timeline: [],
    checkout: null,
    suggestedRefundPaise: 0,
    refundableBalancePaise: 0,
  });

  assert.equal(dto.wallet.remainingDepositPaise, 0);
  assert.equal(dto.timeline.length, 0);
  assert.doesNotThrow(() => JSON.stringify(dto));
});
