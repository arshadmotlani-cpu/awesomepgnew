/**
 * Room OS Wave 1 — LedgerProjection unit tests.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  mapLedgerCategorySlice,
  resolveLedgerCategoryStatus,
  resolvePaymentState,
} from '@/src/roomOs/engines/ledger/resolveBookingLedgerFacts';

describe('Room OS Wave 1 — LedgerProjection', () => {
  test('category status: no activity → none', () => {
    assert.equal(
      resolveLedgerCategoryStatus({
        requiredPaise: 0,
        paidPaise: 0,
        outstandingPaise: 0,
        items: [],
      }),
      'none',
    );
  });

  test('category status: fully paid → current', () => {
    assert.equal(
      resolveLedgerCategoryStatus({
        requiredPaise: 50_000,
        paidPaise: 50_000,
        outstandingPaise: 0,
        items: [],
      }),
      'current',
    );
  });

  test('category status: overdue item → overdue', () => {
    assert.equal(
      resolveLedgerCategoryStatus({
        requiredPaise: 50_000,
        paidPaise: 0,
        outstandingPaise: 50_000,
        items: [{ status: 'overdue' }],
      }),
      'overdue',
    );
  });

  test('category status: outstanding without overdue → outstanding', () => {
    assert.equal(
      resolveLedgerCategoryStatus({
        requiredPaise: 50_000,
        paidPaise: 10_000,
        outstandingPaise: 40_000,
        items: [{ status: 'pending' }],
      }),
      'outstanding',
    );
  });

  test('mapLedgerCategorySlice maps paidPaise to receivedPaise', () => {
    const slice = mapLedgerCategorySlice({
      requiredPaise: 100_000,
      paidPaise: 60_000,
      outstandingPaise: 40_000,
      items: [{ status: 'pending' }],
    });
    assert.equal(slice.receivedPaise, 60_000);
    assert.equal(slice.outstandingPaise, 40_000);
    assert.equal(slice.status, 'outstanding');
  });

  test('payment state: pending proof → proof_pending', () => {
    const result = resolvePaymentState({
      bookingStatus: 'confirmed',
      pendingProofCount: 1,
      checkoutSettlementStatus: null,
    });
    assert.equal(result.state, 'proof_pending');
    assert.equal(result.reason, 'payment_proof_awaiting_review');
  });

  test('payment state: open checkout settlement → checkout_open', () => {
    const result = resolvePaymentState({
      bookingStatus: 'confirmed',
      pendingProofCount: 0,
      checkoutSettlementStatus: 'awaiting_admin_review',
    });
    assert.equal(result.state, 'checkout_open');
    assert.equal(result.reason, 'awaiting_admin_review');
  });

  test('payment state: terminal checkout → clear', () => {
    const result = resolvePaymentState({
      bookingStatus: 'confirmed',
      pendingProofCount: 0,
      checkoutSettlementStatus: 'completed',
    });
    assert.equal(result.state, 'clear');
  });

  test('payment state: pending_payment booking → proof_pending', () => {
    const result = resolvePaymentState({
      bookingStatus: 'pending_payment',
      pendingProofCount: 0,
      checkoutSettlementStatus: null,
    });
    assert.equal(result.state, 'proof_pending');
    assert.equal(result.reason, 'pending_payment');
  });
});
