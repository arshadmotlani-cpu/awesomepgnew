import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isExpressRollbackCancellationReason,
  isUnpaidRentInvoice,
  shouldPurgeCancelledRentInvoiceForRetry,
} from '../../src/services/expressRentInvoiceRecovery';

describe('expressRentInvoiceRecovery', () => {
  it('detects express rollback cancellation reasons', () => {
    assert.equal(
      isExpressRollbackCancellationReason(
        '[system] Express walk-in rolled back — invoice creation failed mid-flight',
      ),
      true,
    );
    assert.equal(isExpressRollbackCancellationReason('[rollback] Unified invoice sync failed.'), true);
    assert.equal(isExpressRollbackCancellationReason('Admin cancelled manually'), false);
    assert.equal(isExpressRollbackCancellationReason(null), false);
  });

  it('detects unpaid rent invoices', () => {
    assert.equal(isUnpaidRentInvoice({ paidPrincipalPaise: 0, paymentId: null }), true);
    assert.equal(isUnpaidRentInvoice({ paidPrincipalPaise: 100, paymentId: null }), false);
    assert.equal(isUnpaidRentInvoice({ paidPrincipalPaise: 0, paymentId: 'pay-1' }), false);
  });

  it('purges only unpaid cancelled express rollback tombstones', () => {
    assert.equal(
      shouldPurgeCancelledRentInvoiceForRetry({
        status: 'cancelled',
        paidPrincipalPaise: 0,
        paymentId: null,
        cancellationReason: '[rollback] finalize failed',
      }),
      true,
    );
    assert.equal(
      shouldPurgeCancelledRentInvoiceForRetry({
        status: 'cancelled',
        paidPrincipalPaise: 500,
        paymentId: null,
        cancellationReason: '[rollback] finalize failed',
      }),
      false,
    );
    assert.equal(
      shouldPurgeCancelledRentInvoiceForRetry({
        status: 'pending',
        paidPrincipalPaise: 0,
        paymentId: null,
        cancellationReason: '[rollback] finalize failed',
      }),
      false,
    );
  });
});
