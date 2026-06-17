import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionFinancialStatus,
  canTransitionRentStatus,
  expressSaleIdempotencyKey,
  expressSalePaymentIdempotencyKey,
  isFinancialInvoiceCancellable,
  isFinancialInvoicePaymentLocked,
  isRentInvoiceCancellable,
  isRentInvoicePaymentLocked,
  guardFinancialStatusTransition,
  guardRentStatusTransition,
  mergeFinancialStatusFromRent,
} from '../../src/lib/billing/invoiceStateMachine';

describe('invoice state machine — rent', () => {
  it('allows pending → payment_in_progress → paid', () => {
    assert.equal(canTransitionRentStatus('pending', 'payment_in_progress'), true);
    assert.equal(canTransitionRentStatus('payment_in_progress', 'paid'), true);
  });

  it('allows pending → expired but not paid → cancelled', () => {
    assert.equal(canTransitionRentStatus('pending', 'expired'), true);
    assert.equal(canTransitionRentStatus('paid', 'cancelled'), false);
    assert.equal(canTransitionRentStatus('payment_in_progress', 'cancelled'), false);
  });

  it('locks payment_in_progress and paid from cancellation', () => {
    assert.equal(isRentInvoiceCancellable('pending'), true);
    assert.equal(isRentInvoiceCancellable('payment_in_progress'), false);
    assert.equal(isRentInvoicePaymentLocked('payment_in_progress'), true);
    assert.equal(isRentInvoicePaymentLocked('paid'), true);
  });
});

describe('invoice state machine — financial', () => {
  it('blocks cancel from payment-locked statuses', () => {
    assert.equal(isFinancialInvoiceCancellable('sent'), true);
    assert.equal(isFinancialInvoiceCancellable('expired'), true);
    assert.equal(isFinancialInvoiceCancellable('payment_in_progress'), false);
    assert.equal(isFinancialInvoiceCancellable('processing'), false);
    assert.equal(isFinancialInvoiceCancellable('settled'), false);
    assert.equal(isFinancialInvoiceCancellable('paid'), false);
    assert.equal(isFinancialInvoicePaymentLocked('processing'), true);
  });

  it('never allows paid → cancelled', () => {
    assert.equal(canTransitionFinancialStatus('paid', 'cancelled'), false);
    assert.equal(canTransitionFinancialStatus('payment_in_progress', 'cancelled'), false);
    assert.equal(canTransitionFinancialStatus('processing', 'cancelled'), false);
  });
});

describe('mergeFinancialStatusFromRent race guard', () => {
  it('does not downgrade payment_in_progress financial row when rent still pending with proof', () => {
    const merged = mergeFinancialStatusFromRent(
      'payment_in_progress',
      'pending',
      '2099-12-31',
      true,
    );
    assert.equal(merged, 'payment_in_progress');
  });

  it('does not apply cancelled from rent sync when financial is paid', () => {
    const merged = mergeFinancialStatusFromRent(
      'paid',
      'cancelled',
      '2099-12-31',
      false,
    );
    assert.equal(merged, 'paid');
  });
});

describe('invoice state machine — guards', () => {
  it('guard helpers reject forbidden transitions', () => {
    assert.deepEqual(guardRentStatusTransition('paid', 'cancelled'), {
      ok: false,
      error: 'Invalid rent invoice transition paid → cancelled',
    });
    assert.deepEqual(guardRentStatusTransition('pending', 'paid'), { ok: true });
    assert.deepEqual(guardFinancialStatusTransition('payment_in_progress', 'cancelled'), {
      ok: false,
      error: 'Invalid financial invoice transition payment_in_progress → cancelled',
    });
  });
});

describe('express sale idempotency keys', () => {
  it('uses stable rent invoice key', () => {
    const key = expressSaleIdempotencyKey({
      rentInvoiceId: 'abc',
      linkId: 'link-1',
    });
    assert.equal(key, 'express-sale:rent:abc');
  });

  it('uses link-scoped payment key', () => {
    assert.equal(
      expressSalePaymentIdempotencyKey('link-99'),
      'express-sale:payment:link-99',
    );
  });
});
