import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDismissedFromOperationsQueue,
  parseDomainIdsFromQueueItemId,
  type OperationsQueueDismissalIndex,
} from '../../src/services/operationsQueueDismissals';
import { isStaleZeroRefundSettlement } from '../../src/lib/residents/checkoutOpsQueueCopy';

describe('operations queue dismissals', () => {
  it('parses domain ids from queue item ids', () => {
    assert.deepEqual(parseDomainIdsFromQueueItemId('moveout-abc'), {
      vacatingRequestId: 'abc',
      settlementId: null,
      bookingId: null,
    });
    assert.deepEqual(parseDomainIdsFromQueueItemId('checkout-refund-set-1'), {
      vacatingRequestId: null,
      settlementId: 'set-1',
      bookingId: null,
    });
    assert.deepEqual(parseDomainIdsFromQueueItemId('deposit-refund-book-1'), {
      vacatingRequestId: null,
      settlementId: null,
      bookingId: 'book-1',
    });
  });

  it('matches dismissed residents by customer, booking, vacating, or settlement', () => {
    const index: OperationsQueueDismissalIndex = {
      customerIds: new Set(['cust-1']),
      bookingIds: new Set(['book-1']),
      vacatingIds: new Set(['vac-1']),
      settlementIds: new Set(['set-1']),
    };
    assert.equal(isDismissedFromOperationsQueue(index, { customerId: 'cust-1' }), true);
    assert.equal(isDismissedFromOperationsQueue(index, { bookingId: 'book-1' }), true);
    assert.equal(isDismissedFromOperationsQueue(index, { vacatingRequestId: 'vac-1' }), true);
    assert.equal(isDismissedFromOperationsQueue(index, { settlementId: 'set-1' }), true);
    assert.equal(isDismissedFromOperationsQueue(index, { customerId: 'other' }), false);
  });

  it('treats refund_pending with zero refund as stale', () => {
    assert.equal(
      isStaleZeroRefundSettlement({ status: 'refund_pending', finalRefundPaise: 0 }),
      true,
    );
    assert.equal(
      isStaleZeroRefundSettlement({ status: 'refund_pending', finalRefundPaise: 100 }),
      false,
    );
  });
});
