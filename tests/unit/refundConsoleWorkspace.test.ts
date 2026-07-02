import assert from 'node:assert/strict';
import test from 'node:test';
import { toRefundConsoleWorkspaceDTO } from '@/src/lib/refund/refundConsoleDto';
import { refundConsoleHref } from '@/src/lib/refund/refundConsoleLinks';
import { parseOperationsFilter } from '@/src/lib/operations/operationsFilterLinks';

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
    ledger: [],
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
  assert.equal(dto.checkout?.settlementHref, '/admin/checkout-settlements/s1');
});
